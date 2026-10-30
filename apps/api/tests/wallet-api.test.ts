import { beforeAll, afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createApi } from '../src/app';
import { AuthService } from '../src/auth/auth-service';
import { LedgerService } from '../src/ledger/ledger-service';
import { createAuthClient } from '../../../packages/api-client/src/auth';
import { createWalletClient } from '../../../packages/api-client/src/wallet';
import { createPaymentClient } from '../../../packages/api-client/src/payments';

let app: Awaited<ReturnType<typeof createApi>>;
let baseUrl: string;
const codes = new Map<string, string>();
let ledger: LedgerService;
beforeAll(async () => {
  const databaseUrl = process.env.LEDGER_TEST_DATABASE_URL;
  if (
    process.env.NODE_ENV !== 'test' ||
    !databaseUrl ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(databaseUrl).pathname)
  )
    throw new Error('Isolated ledger API test database required.');
  app = await createApi({
    databaseUrl,
    mode: 'local',
    emailProvider: {
      async sendCode(email, code) {
        codes.set(email, code);
      },
    },
  });
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
  ledger = app.get(LedgerService);
});
afterAll(async () => {
  await app?.close();
});
async function client() {
  const deviceId = randomUUID();
  const email = `api-wallet-${randomUUID()}@example.test`;
  const authClient = createAuthClient(baseUrl, { client: 'mobile', deviceId });
  const request = await authClient.requestCode(
    email,
    'Synthetic fixture password 42',
    'signup',
  );
  const code = codes.get(email);
  if (!code) throw new Error('Missing test code.');
  const session = await authClient.verifyCode(request.challengeId, code);
  return {
    walletClient: createWalletClient(baseUrl, {
      accessToken: session.accessToken,
      deviceId,
    }),
    session,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
      'X-Device-Id': deviceId,
    },
  };
}
it('requires sign-in, opens an empty wallet idempotently and uses typed balance/history responses', async () => {
  expect((await fetch(`${baseUrl}/wallet`)).status).toBe(401);
  const { walletClient } = await client();
  await expect(walletClient.getBalance()).rejects.toMatchObject({
    status: 404,
  });
  const wallet = await walletClient.openWallet();
  expect(wallet).toMatchObject({
    currency: 'NGN',
    availableKobo: 0,
    heldKobo: 0,
    totalKobo: 0,
  });
  expect(await walletClient.openWallet()).toEqual(wallet);
  expect(await walletClient.getBalance()).toEqual(wallet);
  expect(await walletClient.getHistory()).toEqual({
    items: [],
    nextCursor: null,
  });
  await ledger.topup({
    walletId: wallet.id,
    amountKobo: 50000n,
    idempotencyKey: randomUUID(),
    reference: randomUUID(),
  });
  expect((await walletClient.getBalance()).availableKobo).toBe(50000);
  expect((await walletClient.getHistory()).items).toHaveLength(1);
});
it('rejects wallet selectors, unknown fields, invalid limits/cursors and public money mutations', async () => {
  const { headers, walletClient } = await client();
  const wallet = await walletClient.openWallet();
  for (const query of [
    'walletId=' + randomUUID(),
    'limit=51',
    'limit=0',
    'limit=1&limit=2',
    'offset=0',
    'cursor=invalid',
  ]) {
    const path = query.startsWith('walletId') ? '/wallet?' : '/wallet/history?';
    expect((await fetch(`${baseUrl}${path}${query}`, { headers })).status).toBe(
      400,
    );
  }
  expect(
    (
      await fetch(`${baseUrl}/wallet`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ amountKobo: 100000 }),
      })
    ).status,
  ).toBe(400);
  for (const path of [
    'topup',
    'hold',
    'release',
    'capture',
    'debit',
    'refund',
    'payout',
  ])
    expect(
      (
        await fetch(`${baseUrl}/wallet/${path}`, {
          method: 'POST',
          headers,
          body: '{}',
        })
      ).status,
    ).toBe(404);
  expect(await ledger.balances(wallet.id)).toEqual({
    availableKobo: 0n,
    heldKobo: 0n,
  });
});
it('isolates each buyer wallet and paginates history without leaking idempotency data', async () => {
  const first = await client();
  const second = await client();
  const a = await first.walletClient.openWallet();
  const b = await second.walletClient.openWallet();
  for (let index = 0; index < 4; index++)
    await ledger.topup({
      walletId: a.id,
      amountKobo: 100n,
      idempotencyKey: randomUUID(),
      reference: randomUUID(),
    });
  const page = await first.walletClient.getHistory({ limit: 2 });
  expect(page.items).toHaveLength(2);
  for (const item of page.items) {
    expect(item).not.toHaveProperty('idempotencyKey');
    expect(item).not.toHaveProperty('requestHash');
  }
  if (!page.nextCursor) throw new Error('Expected cursor.');
  expect(
    (await first.walletClient.getHistory({ limit: 2, cursor: page.nextCursor }))
      .items,
  ).toHaveLength(2);
  expect(await second.walletClient.getHistory()).toEqual({
    items: [],
    nextCursor: null,
  });
  expect((await second.walletClient.getBalance()).id).toBe(b.id);
  const otherSelector = await fetch(
    `${baseUrl}/wallet/history?walletId=${a.id}`,
    { headers: second.headers },
  );
  expect(otherSelector.status).toBe(400);
});
it('documents wallet operations and ends access after logout', async () => {
  const { session, headers } = await client();
  const doc = (await (await fetch(`${baseUrl}/docs-json`)).json()) as {
    paths: Record<string, unknown>;
  };
  expect(doc.paths).toHaveProperty('/wallet');
  expect(doc.paths).toHaveProperty('/wallet/history');
  const auth = app.get(AuthService);
  const deviceId = headers['X-Device-Id'];
  if (!session.refreshToken) throw new Error('Missing native refresh token.');
  await auth.logout(
    { client: 'mobile', deviceId, refreshToken: session.refreshToken },
    session.refreshToken,
    'wallet-api-test',
  );
  expect((await fetch(`${baseUrl}/wallet`, { headers })).status).toBe(401);
});
it('quotes the buyer-paid fee through the typed client before any bank transfer', async () => {
  const { session, headers } = await client();
  const payments = createPaymentClient(baseUrl, {
    accessToken: session.accessToken,
    deviceId: headers['X-Device-Id'],
  });
  expect(await payments.quote(1000000)).toEqual({
    transferKobo: 1000000,
    feeKobo: 10000,
    creditKobo: 990000,
    currency: 'NGN',
    feePolicy: 'paystack-dva-v1',
  });
  expect(await payments.getAccount()).toEqual({ status: 'not_requested' });
  expect(
    (
      await fetch(`${baseUrl}/payments/quote`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ transferKobo: 1000000, feeKobo: 0 }),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await fetch(`${baseUrl}/payments/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"transferKobo":1000000}',
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await fetch(`${baseUrl}/payments/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-paystack-signature': 'bad',
        },
        body: '{}',
      })
    ).status,
  ).toBe(503);
  expect(
    (await fetch(`${baseUrl}/payments/reconcile`, { method: 'POST' })).status,
  ).toBe(401);
});
it('quotes both card fee tiers through the typed client and rejects card data at the API boundary', async () => {
  const { session, headers } = await client();
  const payments = createPaymentClient(baseUrl, {
    accessToken: session.accessToken,
    deviceId: headers['X-Device-Id'],
  });
  expect(await payments.quoteCard(1000000, 'local')).toMatchObject({
    feeKobo: 25000,
    creditKobo: 975000,
    feePolicy: 'paystack-card-local-v1',
  });
  expect(await payments.quoteCard(1000000, 'international')).toMatchObject({
    feeKobo: 49000,
    creditKobo: 951000,
    feePolicy: 'paystack-card-international-v1',
  });
  const request = {
    amountKobo: 1000000,
    cardType: 'local',
    feePolicy: 'paystack-card-local-v1',
    acceptedFeeKobo: 25000,
    acceptedCreditKobo: 975000,
    consent: true,
    idempotencyKey: randomUUID(),
  };
  expect(
    (
      await fetch(`${baseUrl}/payments/card/initialize`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...request, cardNumber: 'not-accepted' }),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await fetch(`${baseUrl}/payments/card/initialize`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      })
    ).status,
  ).toBe(503);
  expect(
    (
      await fetch(`${baseUrl}/payments/card/confirm`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ paymentId: randomUUID() }),
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await fetch(`${baseUrl}/payments/card/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountKobo: 1000000, cardType: 'local' }),
      })
    ).status,
  ).toBe(401);
});
