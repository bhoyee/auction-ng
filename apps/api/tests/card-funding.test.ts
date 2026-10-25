import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createHmac, randomUUID } from 'node:crypto';
import { PaymentService } from '../src/payments/payment-service';
import type {
  PaymentProvider,
  VerifiedTransfer,
} from '../src/payments/payment-provider';
import { LedgerService } from '../src/ledger/ledger-service';
import { encryptPii, hashPii } from '../src/security/pii';
import { createApi } from '../src/app';
import { createAuthClient } from '../../../packages/api-client/src/auth';
import { createPaymentClient } from '../../../packages/api-client/src/payments';
import { createWalletClient } from '../../../packages/api-client/src/wallet';

let ledger: LedgerService;
let service: PaymentService;
const verified = new Map<string, VerifiedTransfer>();
const signatureSecret = 'synthetic-card-webhook-fixture';
const initialize = vi.fn<PaymentProvider['initializeCard']>(async (input) => ({
  authorizationUrl: `https://checkout.paystack.com/${encodeURIComponent(input.reference)}`,
}));
const provider: PaymentProvider = {
  initializeCard: initialize,
  verifySignature(raw, signature) {
    return (
      signature ===
      createHmac('sha512', signatureSecret).update(raw).digest('hex')
    );
  },
  async assignAccount() {
    throw new Error('DVA setup is not required for card funding');
  },
  async getAccount() {
    return null;
  },
  async verifyTransfer(reference) {
    const result = verified.get(reference);
    if (!result) throw new Error('Unknown synthetic transfer');
    return result;
  },
  async listTransfers() {
    return [...verified.keys()];
  },
};
beforeAll(() => {
  const url = process.env.LEDGER_TEST_DATABASE_URL;
  if (
    process.env.NODE_ENV !== 'test' ||
    !url ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname)
  )
    throw new Error('Isolated card test database required');
  ledger = new LedgerService(url);
  service = new PaymentService(ledger, provider);
});
afterAll(async () => {
  await ledger?.close();
});
async function buyer() {
  const email = `card-${randomUUID()}@example.test`;
  const user = await ledger.db.user.create({
    data: {
      name: 'Card test buyer',
      emailVerifiedAt: new Date(),
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
    },
  });
  return { user, email, wallet: await ledger.openWallet(user.id) };
}
const input = () => ({
  amountKobo: 1000000,
  cardType: 'local' as const,
  feePolicy: 'paystack-card-local-v1' as const,
  acceptedFeeKobo: 25000,
  acceptedCreditKobo: 975000,
  consent: true as const,
  idempotencyKey: randomUUID(),
});
async function checkout() {
  const b = await buyer();
  const result = await service.initializeCard(b.user.id, input());
  const payment = await ledger.db.payment.findUniqueOrThrow({
    where: { id: result.paymentId },
  });
  verified.set(payment.providerRef, {
    reference: payment.providerRef,
    customerCode: 'CUS_synthetic',
    customerEmail: b.email,
    cardCountry: 'NG',
    amountKobo: 1000000,
    feeKobo: 25000,
    currency: 'NGN',
    domain: 'test',
    status: 'success',
    channel: 'card',
  });
  return { ...b, result, payment };
}
function event(reference: string) {
  const raw = Buffer.from(
    JSON.stringify({ event: 'charge.success', data: { reference } }),
  );
  return {
    raw,
    signature: createHmac('sha512', signatureSecret).update(raw).digest('hex'),
  };
}
it('initializes one hosted checkout per accepted retry key without crediting before verification', async () => {
  const b = await buyer();
  const request = input();
  const before = initialize.mock.calls.length;
  const results = await Promise.all(
    Array.from({ length: 5 }, () => service.initializeCard(b.user.id, request)),
  );
  expect(new Set(results.map((result) => result.paymentId)).size).toBe(1);
  expect(initialize.mock.calls.length - before).toBe(1);
  expect(results[0]).toMatchObject({
    amountKobo: 1000000,
    feeKobo: 25000,
    creditKobo: 975000,
  });
  expect((await ledger.balances(b.wallet.id)).availableKobo).toBe(0n);
  await expect(
    service.initializeCard(b.user.id, {
      ...request,
      amountKobo: 2000000,
      acceptedFeeKobo: 40000,
      acceptedCreditKobo: 1960000,
    }),
  ).rejects.toThrow();
  await expect(
    service.initializeCard(b.user.id, { ...input(), acceptedFeeKobo: 0 }),
  ).rejects.toThrow();
});
it('credits a card payment once under ten signed webhook deliveries and releases outbid funds to the wallet', async () => {
  const b = await checkout();
  const e = event(b.payment.providerRef);
  await Promise.all(
    Array.from({ length: 10 }, () => service.webhook(e.raw, e.signature)),
  );
  expect(await ledger.balances(b.wallet.id)).toEqual({
    availableKobo: 975000n,
    heldKobo: 0n,
  });
  expect(
    await ledger.db.ledgerTransaction.count({
      where: { walletId: b.wallet.id },
    }),
  ).toBe(1);
  const holdId = randomUUID();
  await ledger.hold({
    walletId: b.wallet.id,
    holdId,
    amountKobo: 500000n,
    idempotencyKey: randomUUID(),
    reference: randomUUID(),
  });
  await ledger.releaseHold({
    walletId: b.wallet.id,
    holdId,
    idempotencyKey: randomUUID(),
    reference: randomUUID(),
  });
  expect(await ledger.balances(b.wallet.id)).toEqual({
    availableKobo: 975000n,
    heldKobo: 0n,
  });
  expect((await service.history(b.user.id, {})).items[0]).toMatchObject({
    fundingMethod: 'card',
    feeKobo: 25000,
    creditKobo: 975000,
    status: 'credited',
  });
});
it('re-fetches the provider for owner confirmation and never treats a return URL as payment proof', async () => {
  const b = await checkout();
  const other = await buyer();
  await expect(
    service.confirmCard(other.user.id, b.payment.id),
  ).rejects.toThrow();
  await service.confirmCard(b.user.id, b.payment.id);
  await service.confirmCard(b.user.id, b.payment.id);
  expect((await ledger.balances(b.wallet.id)).availableKobo).toBe(975000n);
  const report = await service.reconcile(
    new Date(Date.now() - 86400000),
    new Date(),
  );
  expect(
    report.mismatches.some((item) => item.reference === b.payment.providerRef),
  ).toBe(false);
});
it('rejects unbound cards and changed amounts, fees, issuer tier, owner email, currency or domain', async () => {
  for (const change of [
    { amountKobo: 2000000 },
    { feeKobo: 30000 },
    { cardCountry: 'US' },
    { customerEmail: 'other@example.test' },
    { currency: 'USD' },
    { domain: 'live' },
    { reference: 'wrong-reference' },
    { channel: 'bank_transfer' },
  ]) {
    const b = await checkout();
    const original = verified.get(b.payment.providerRef);
    if (!original) throw new Error('Missing fixture');
    verified.set(b.payment.providerRef, { ...original, ...change });
    const e = event(b.payment.providerRef);
    await expect(service.webhook(e.raw, e.signature)).rejects.toThrow();
    expect((await ledger.balances(b.wallet.id)).availableKobo).toBe(0n);
  }
  const reference = `auction-card-${randomUUID()}`;
  verified.set(reference, {
    reference,
    customerCode: 'CUS_synthetic',
    customerEmail: 'other@example.test',
    cardCountry: 'NG',
    amountKobo: 1000000,
    feeKobo: 25000,
    currency: 'NGN',
    domain: 'test',
    status: 'success',
    channel: 'card',
  });
  const e = event(reference);
  await expect(service.webhook(e.raw, e.signature)).rejects.toThrow();
});
it('retains an uncertain initialization intent and does not issue another checkout on retry', async () => {
  const b = await buyer();
  const request = input();
  const before = initialize.mock.calls.length;
  initialize.mockRejectedValueOnce(new Error('Synthetic provider timeout'));
  await expect(service.initializeCard(b.user.id, request)).rejects.toThrow();
  await expect(service.initializeCard(b.user.id, request)).rejects.toThrow();
  expect(initialize.mock.calls.length - before).toBe(1);
  expect((await ledger.balances(b.wallet.id)).availableKobo).toBe(0n);
});
it('keeps empty wallets unable to reserve bids and requires card funding consent', async () => {
  const b = await buyer();
  await expect(
    ledger.hold({
      walletId: b.wallet.id,
      holdId: randomUUID(),
      amountKobo: 1n,
      idempotencyKey: randomUUID(),
      reference: randomUUID(),
    }),
  ).rejects.toThrow();
  await expect(
    Reflect.apply(service.initializeCard, service, [
      b.user.id,
      { ...input(), consent: false },
    ]),
  ).rejects.toThrow();
  await expect(
    Reflect.apply(service.initializeCard, service, [
      b.user.id,
      { ...input(), cardNumber: 'not-accepted' },
    ]),
  ).rejects.toThrow();
});
it('keeps pending and declined card payments out of spendable wallet funds', async () => {
  const b = await checkout();
  const original = verified.get(b.payment.providerRef);
  if (!original) throw new Error('Missing fixture');
  verified.set(b.payment.providerRef, {
    ...original,
    status: 'pending',
    feeKobo: null,
    cardCountry: undefined,
  });
  expect(await service.confirmCard(b.user.id, b.payment.id)).toEqual({
    paymentId: b.payment.id,
    status: 'pending',
  });
  verified.set(b.payment.providerRef, {
    ...original,
    status: 'failed',
    feeKobo: null,
  });
  expect(await service.confirmCard(b.user.id, b.payment.id)).toEqual({
    paymentId: b.payment.id,
    status: 'failed',
  });
  expect((await ledger.balances(b.wallet.id)).availableKobo).toBe(0n);
});
it('supports an explicitly accepted international-card fee without applying the local cap', async () => {
  const b = await buyer();
  const result = await service.initializeCard(b.user.id, {
    ...input(),
    cardType: 'international',
    feePolicy: 'paystack-card-international-v1',
    acceptedFeeKobo: 49000,
    acceptedCreditKobo: 951000,
  });
  const payment = await ledger.db.payment.findUniqueOrThrow({
    where: { id: result.paymentId },
  });
  verified.set(payment.providerRef, {
    reference: payment.providerRef,
    customerCode: 'CUS_synthetic',
    customerEmail: b.email,
    cardCountry: 'US',
    amountKobo: 1000000,
    feeKobo: 49000,
    currency: 'NGN',
    domain: 'test',
    status: 'success',
    channel: 'card',
  });
  await service.confirmCard(b.user.id, payment.id);
  expect((await ledger.balances(b.wallet.id)).availableKobo).toBe(951000n);
});
it('database guards preserve accepted amounts and checkout ownership', async () => {
  const b = await checkout();
  await expect(
    ledger.db.payment.update({
      where: { id: b.payment.id },
      data: { amountKobo: 2000000n, feeKobo: 40000n, creditKobo: 1960000n },
    }),
  ).rejects.toThrow();
  await expect(
    ledger.db.payment.update({
      where: { id: b.payment.id },
      data: {
        checkoutUrlCiphertext: encryptPii(
          'https://checkout.paystack.com/replaced',
          'card-checkout',
        ),
      },
    }),
  ).rejects.toThrow();
  expect((await ledger.balances(b.wallet.id)).availableKobo).toBe(0n);
});
it('records one refund request on retries without changing available funds or refunding automatically', async () => {
  const b = await checkout();
  await service.confirmCard(b.user.id, b.payment.id);
  const request = {
    paymentId: b.payment.id,
    amountKobo: 500000,
    reason: 'I want the unused funds returned',
    idempotencyKey: randomUUID(),
  };
  const replies = await Promise.all(
    Array.from({ length: 3 }, () =>
      service.requestFundingRefund(b.user.id, request),
    ),
  );
  expect(new Set(replies.map((reply) => reply.requestId)).size).toBe(1);
  expect(replies[0]).toMatchObject({ status: 'requested', amountKobo: 500000 });
  expect((await ledger.balances(b.wallet.id)).availableKobo).toBe(975000n);
  const other = await buyer();
  await expect(
    service.requestFundingRefund(other.user.id, {
      ...request,
      idempotencyKey: randomUUID(),
    }),
  ).rejects.toThrow();
  await expect(
    service.requestFundingRefund(b.user.id, {
      ...request,
      amountKobo: 1000000,
      idempotencyKey: randomUUID(),
    }),
  ).rejects.toThrow();
  await expect(
    service.requestFundingRefund(b.user.id, { ...request, amountKobo: 400000 }),
  ).rejects.toThrow();
  const audit = await ledger.db.auditLog.findUniqueOrThrow({
    where: { id: replies[0]?.requestId },
  });
  expect(Buffer.from(audit.afterCiphertext ?? []).toString()).not.toContain(
    request.reason,
  );
});
it('funds through authenticated typed clients and a signed webhook, then records a separate refund request', async () => {
  let code: string | undefined;
  const app = await createApi({
    databaseUrl: process.env.LEDGER_TEST_DATABASE_URL,
    mode: 'local',
    emailProvider: {
      async sendCode(_email, value) {
        code = value;
      },
    },
    paymentProvider: provider,
  });
  try {
    await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();
    const deviceId = randomUUID();
    const email = `card-http-${randomUUID()}@example.test`;
    const auth = createAuthClient(url, { client: 'mobile', deviceId });
    const challenge = await auth.requestCode(email);
    if (!code) throw new Error('Missing synthetic code');
    const session = await auth.verifyCode(challenge.challengeId, code);
    const client = createPaymentClient(url, {
      deviceId,
      accessToken: session.accessToken,
    });
    const quote = await client.quoteCard(1000000, 'local');
    const result = await client.initializeCard({
      ...input(),
      acceptedFeeKobo: quote.feeKobo,
      acceptedCreditKobo: quote.creditKobo,
    });
    const payment = await ledger.db.payment.findUniqueOrThrow({
      where: { id: result.paymentId },
    });
    verified.set(payment.providerRef, {
      reference: payment.providerRef,
      customerCode: 'CUS_synthetic',
      customerEmail: email,
      cardCountry: 'NG',
      amountKobo: 1000000,
      feeKobo: 25000,
      currency: 'NGN',
      domain: 'test',
      status: 'success',
      channel: 'card',
    });
    const e = event(payment.providerRef);
    expect(
      (
        await fetch(`${url}/payments/webhook`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-paystack-signature': e.signature,
          },
          body: e.raw.toString(),
        })
      ).status,
    ).toBe(200);
    expect(await client.confirmCard(payment.id)).toEqual({
      paymentId: payment.id,
      status: 'credited',
    });
    const request = await client.requestRefund({
      paymentId: payment.id,
      amountKobo: 100000,
      reason: 'Return unused funds',
      idempotencyKey: randomUUID(),
    });
    expect(request.status).toBe('requested');
    expect(
      (
        await createWalletClient(url, {
          deviceId,
          accessToken: session.accessToken,
        }).getBalance()
      ).availableKobo,
    ).toBe(975000);
  } finally {
    await app.close();
  }
});
