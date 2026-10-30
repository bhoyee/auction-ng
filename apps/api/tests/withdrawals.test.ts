import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { LedgerService } from '../src/ledger/ledger-service';
import { WithdrawalService } from '../src/withdrawals/withdrawal-service';
import { AuthService } from '../src/auth/auth-service';
import { decryptPii, encryptPii, hashPii } from '../src/security/pii';
import { hashStaffPassword } from '../src/auth/staff-crypto';
import type { PaymentProvider } from '../src/payments/payment-provider';
import { createApi } from '../src/app';
let ledger: LedgerService, auth: AuthService, service: WithdrawalService;
const codes = new Map<string, string>();
const transfers = new Map<
  string,
  { recipientCode: string; amountKobo: number; status: string; feeKobo: number }
>();
let sends = 0,
  timeout = false;
beforeAll(async () => {
  const url = process.env.LEDGER_TEST_DATABASE_URL;
  if (!url || !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
    throw Error('Isolated database required');
  ledger = new LedgerService(url);
  auth = new AuthService({
    databaseUrl: url,
    mode: 'local',
    emailProvider: {
      async sendCode(email, code, purpose) {
        expect(purpose).toBe('withdraw');
        codes.set(email, code);
      },
    },
  });
  const provider = {
    async sendPayout(input) {
      sends++;
      transfers.set(input.reference, {
        ...input,
        status: 'pending',
        feeKobo: 1000,
      });
      if (timeout) throw Error('Simulated ambiguous timeout');
    },
    async verifyPayout(reference) {
      const value = transfers.get(reference);
      return value
        ? { ...value, reference, currency: 'NGN', domain: 'test' }
        : null;
    },
  } as Pick<PaymentProvider, 'sendPayout' | 'verifyPayout'>;
  service = new WithdrawalService(ledger, auth, provider as PaymentProvider, {
    enabled: true,
  });
});
afterAll(async () => {
  await auth?.close();
  await ledger?.close();
});
async function fixture(bank = true) {
  const email = randomUUID() + '@example.test';
  const user = await ledger.db.user.create({
    data: {
      name: 'Synthetic buyer',
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
      emailVerifiedAt: new Date(),
      buyerPasswordHash: await hashStaffPassword('Example-password-384!'),
    },
  });
  const wallet = await ledger.openWallet(user.id);
  await ledger.topup(
    {
      walletId: wallet.id,
      amountKobo: 1000000n,
      idempotencyKey: randomUUID(),
      reference: randomUUID(),
    },
    bank ? 'bank' : 'review',
  );
  const session = await ledger.db.authSession.create({
    data: {
      userId: user.id,
      buyerMfa: true,
      familyId: randomUUID(),
      deviceHash: '0'.repeat(64),
      client: 'web',
      accessHash: randomBytes(32).toString('hex'),
      refreshHash: randomBytes(32).toString('hex'),
      accessExpiresAt: new Date(Date.now() + 900000),
      expiresAt: new Date(Date.now() + 900000),
    },
  });
  const account = await ledger.db.withdrawalBank.create({
    data: {
      userId: user.id,
      accountHash: randomBytes(32).toString('hex'),
      status: 'verified',
      verifiedAt: new Date(),
      recipientCode: 'RCP_test' + user.id.replaceAll('-', ''),
      detailsCiphertext: encryptPii(
        JSON.stringify({
          bankCode: '058',
          accountNumber: '0123456789',
          accountName: 'Synthetic buyer',
          bankName: 'Synthetic bank',
          firstName: 'Synthetic',
          lastName: 'buyer',
        }),
        'withdrawal-bank',
      ),
    },
  });
  return { user, wallet, session, account, email };
}
async function start(
  f: Awaited<ReturnType<typeof fixture>>,
  key = randomUUID(),
) {
  return service.start(f.user.id, f.session.id, {
    bankId: f.account.id,
    amountKobo: 100000,
    acceptedTotalKobo: 101000,
    password: 'Example-password-384!',
    idempotencyKey: key,
  });
}
it('checks principal plus fees against available funds before showing a quote', async () => {
  const f = await fixture();
  const before = await ledger.balances(f.wallet.id);
  await expect(service.quoteForBuyer(f.user.id, 999000)).rejects.toThrow(
    'Insufficient funds',
  );
  expect(await service.quoteForBuyer(f.user.id, 997500)).toMatchObject({
    totalKobo: 1000000,
  });
  expect(await ledger.balances(f.wallet.id)).toEqual(before);
  expect(
    await ledger.db.withdrawal.count({ where: { userId: f.user.id } }),
  ).toBe(0);
  expect(codes.has(f.email)).toBe(false);
});
it('excludes reserved funds from quote eligibility and rechecks after a successful quote', async () => {
  const f = await fixture();
  const quote = await service.quoteForBuyer(f.user.id, 997500);
  const draft = await service.start(f.user.id, f.session.id, {
    bankId: f.account.id,
    amountKobo: quote.amountKobo,
    acceptedTotalKobo: quote.totalKobo,
    password: 'Example-password-384!',
    idempotencyKey: randomUUID(),
  });
  await ledger.hold({
    walletId: f.wallet.id,
    holdId: randomUUID(),
    amountKobo: 100000n,
    reference: randomUUID(),
    idempotencyKey: randomUUID(),
  });
  await expect(service.quoteForBuyer(f.user.id, 997500)).rejects.toThrow(
    'Insufficient funds',
  );
  const code = codes.get(f.email);
  if (!code) throw Error('Missing synthetic code');
  await expect(
    service.confirm(f.user.id, f.session.id, { id: draft.id, code }),
  ).rejects.toThrow('Available wallet funds are too low');
  expect((await ledger.balances(f.wallet.id)).heldKobo).toBe(100000n);
});
it('holds once, sends once after an ambiguous response, then settles from verified provider state', async () => {
  const f = await fixture();
  const draft = await start(f);
  const code = codes.get(f.email);
  if (!code) throw Error('Missing synthetic code');
  await Promise.all([
    service.confirm(f.user.id, f.session.id, { id: draft.id, code }),
    service.confirm(f.user.id, f.session.id, { id: draft.id, code }),
  ]);
  expect((await ledger.balances(f.wallet.id)).heldKobo).toBe(101000n);
  timeout = true;
  const before = sends;
  await service.process(draft.id);
  timeout = false;
  await service.process(draft.id);
  expect(sends - before).toBe(1);
  const row = await ledger.db.withdrawal.findUniqueOrThrow({
    where: { id: draft.id },
  });
  const transfer = transfers.get(row.reference);
  if (!transfer) throw Error('Missing transfer');
  transfer.status = 'success';
  await Promise.all([service.process(draft.id), service.process(draft.id)]);
  expect((await service.get(f.user.id, draft.id)).status).toBe('success');
  expect((await ledger.balances(f.wallet.id)).availableKobo).toBe(899000n);
  transfer.status = 'reversed';
  transfer.feeKobo = 0;
  await service.process(draft.id);
  await service.process(draft.id);
  expect((await ledger.balances(f.wallet.id)).availableKobo).toBe(1000000n);
});
it('keeps card-funded withdrawals in review and protects ownership and bad codes', async () => {
  const f = await fixture(false);
  const draft = await start(f);
  await expect(service.get(randomUUID(), draft.id)).rejects.toThrow();
  await expect(
    service.confirm(f.user.id, f.session.id, {
      id: draft.id,
      code: codes.get(f.email) === '000000' ? '111111' : '000000',
    }),
  ).rejects.toThrow();
  expect(
    (await ledger.db.withdrawal.findUniqueOrThrow({ where: { id: draft.id } }))
      .attempts,
  ).toBe(1);
  const code = codes.get(f.email);
  if (!code) throw Error('Missing code');
  await service.confirm(f.user.id, f.session.id, { id: draft.id, code });
  expect((await service.get(f.user.id, draft.id)).status).toBe('review');
  const before = sends;
  await service.process(draft.id);
  expect(sends).toBe(before);
});
async function codeFor(id: string) {
  const row = await ledger.db.withdrawal.findUniqueOrThrow({ where: { id } });
  return decryptPii(Buffer.from(row.codeCiphertext), 'withdrawal-code');
}
it('enforces the WAT daily limit under parallel confirmation', async () => {
  const f = await fixture();
  await ledger.topup(
    {
      walletId: f.wallet.id,
      amountKobo: 100000000n,
      idempotencyKey: randomUUID(),
      reference: randomUUID(),
    },
    'bank',
  );
  const drafts = await Promise.all(
    [1, 2].map(() =>
      service.start(f.user.id, f.session.id, {
        bankId: f.account.id,
        amountKobo: 30000000,
        acceptedTotalKobo: 30010000,
        password: 'Example-password-384!',
        idempotencyKey: randomUUID(),
      }),
    ),
  );
  const results = await Promise.allSettled(
    drafts.map(async (row) =>
      service.confirm(f.user.id, f.session.id, {
        id: row.id,
        code: await codeFor(row.id),
      }),
    ),
  );
  expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
  expect((await ledger.balances(f.wallet.id)).heldKobo).toBe(30010000n);
});
it('serializes a withdrawal against a competing bid reservation without overspending', async () => {
  const f = await fixture();
  const draft = await service.start(f.user.id, f.session.id, {
    bankId: f.account.id,
    amountKobo: 900000,
    acceptedTotalKobo: 902500,
    password: 'Example-password-384!',
    idempotencyKey: randomUUID(),
  });
  const code = await codeFor(draft.id);
  const results = await Promise.allSettled([
    service.confirm(f.user.id, f.session.id, { id: draft.id, code }),
    ledger.hold({
      walletId: f.wallet.id,
      holdId: randomUUID(),
      amountKobo: 200000n,
      idempotencyKey: randomUUID(),
      reference: randomUUID(),
    }),
  ]);
  expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
  expect(
    (await ledger.balances(f.wallet.id)).availableKobo,
  ).toBeGreaterThanOrEqual(0n);
});
it('expires codes and rejects reused keys, changed fees and mismatched verified transfer details', async () => {
  const f = await fixture();
  const key = randomUUID();
  const draft = await start(f, key);
  expect((await start(f, key)).id).toBe(draft.id);
  await expect(
    service.start(f.user.id, f.session.id, {
      bankId: f.account.id,
      amountKobo: 100001,
      acceptedTotalKobo: 101001,
      password: 'Example-password-384!',
      idempotencyKey: key,
    }),
  ).rejects.toThrow();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + 360000);
  try {
    await expect(
      service.confirm(f.user.id, f.session.id, {
        id: draft.id,
        code: await codeFor(draft.id),
      }),
    ).rejects.toThrow();
  } finally {
    vi.useRealTimers();
  }
  const next = await start(f);
  await service.confirm(f.user.id, f.session.id, {
    id: next.id,
    code: await codeFor(next.id),
  });
  await service.process(next.id);
  const row = await ledger.db.withdrawal.findUniqueOrThrow({
    where: { id: next.id },
  });
  const transfer = transfers.get(row.reference);
  if (!transfer) throw Error('Missing transfer');
  transfer.status = 'success';
  transfer.recipientCode = 'RCP_other';
  await expect(service.process(next.id)).rejects.toThrow();
  expect((await ledger.balances(f.wallet.id)).heldKobo).toBe(101000n);
});
it('verifies the immutable bank identity only from matching callback details plus provider re-fetch', async () => {
  const email = randomUUID() + '@example.test';
  const user = await ledger.db.user.create({
    data: {
      name: 'Editable profile',
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
      emailVerifiedAt: new Date(),
    },
  });
  const customer = 'CUS_' + randomUUID().replaceAll('-', '');
  let identified = false;
  const provider = {
    async resolvePayoutAccount() {
      return { accountName: 'AMINA YUSUF', bankName: 'Synthetic bank' };
    },
    async payoutCustomer() {
      return customer;
    },
    async validatePayoutCustomer() {},
    async verifyPayoutCustomer() {
      return identified;
    },
  } as unknown as PaymentProvider;
  const flow = new WithdrawalService(ledger, auth, provider, { enabled: true });
  const bank = await flow.verifyBank(user.id, {
    bankCode: '058',
    accountNumber: '0123456789',
    bvn: '22222222222',
    firstName: 'Amina',
    lastName: 'Yusuf',
    consent: true,
  });
  expect(bank.status).toBe('pending');
  const data = {
    customer_code: customer,
    identification: {
      country: 'NG',
      type: 'bank_account',
      bank_code: '058',
      account_number: '012****789',
      bvn: '222*****222',
    },
  };
  await expect(
    flow.providerEvent('customeridentification.success', data),
  ).rejects.toThrow();
  identified = true;
  await expect(
    flow.providerEvent('customeridentification.success', {
      ...data,
      identification: { ...data.identification, account_number: '999****999' },
    }),
  ).rejects.toThrow();
  await flow.providerEvent('customeridentification.success', data);
  expect((await flow.overview(user.id)).bank?.status).toBe('verified');
  expect(JSON.stringify(await flow.overview(user.id))).not.toContain(
    '22222222222',
  );
});
it('rejects unauthenticated and non-worker access to withdrawal routes', async () => {
  const app = await createApi({
    databaseUrl: process.env.LEDGER_TEST_DATABASE_URL,
    mode: 'local',
    bidOptions: { enabled: false },
  });
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  try {
    for (const path of [
      '/withdrawals',
      '/withdrawals/overview',
      '/admin/withdrawals/' + randomUUID() + '/review',
    ]) {
      const response = await fetch(base + path, {
        method: path.startsWith('/admin') ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json' },
        ...(path.startsWith('/admin') ? { body: '{}' } : {}),
      });
      expect(response.status).toBe(401);
    }
    expect(
      (
        await fetch(base + '/internal/withdrawals/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(401);
  } finally {
    await app.close();
  }
});
it('requires finance permission and records one review decision without losing reserved funds', async () => {
  const f = await fixture(false),
    draft = await start(f);
  await service.confirm(f.user.id, f.session.id, {
    id: draft.id,
    code: await codeFor(draft.id),
  });
  await expect(
    service.review(f.user.id, draft.id, true, 'Synthetic review'),
  ).rejects.toThrow();
  const email = randomUUID() + '@example.test';
  const finance = await ledger.db.user.create({
    data: {
      name: 'Synthetic finance',
      role: 'finance',
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
    },
  });
  await service.review(finance.id, draft.id, false, 'Synthetic rejection');
  await service.review(finance.id, draft.id, false, 'Synthetic rejection');
  expect((await ledger.balances(f.wallet.id)).availableKobo).toBe(1000000n);
  expect(
    await ledger.db.auditLog.count({
      where: { entityId: draft.id, action: 'withdrawal.rejected' },
    }),
  ).toBe(1);
  const next = await start(f);
  await service.confirm(f.user.id, f.session.id, {
    id: next.id,
    code: await codeFor(next.id),
  });
  await service.review(finance.id, next.id, true, 'Synthetic approval');
  expect((await service.get(f.user.id, next.id)).status).toBe('queued');
});
it('returns a failed small transfer less only its confirmed retained provider fee', async () => {
  const f = await fixture(),
    draft = await start(f);
  await service.confirm(f.user.id, f.session.id, {
    id: draft.id,
    code: await codeFor(draft.id),
  });
  await service.process(draft.id);
  const row = await ledger.db.withdrawal.findUniqueOrThrow({
      where: { id: draft.id },
    }),
    transfer = transfers.get(row.reference);
  if (!transfer) throw Error('Missing transfer');
  transfer.status = 'failed';
  transfer.feeKobo = 500;
  await service.process(draft.id);
  expect((await ledger.balances(f.wallet.id)).availableKobo).toBe(999500n);
  expect(await service.get(f.user.id, draft.id)).toMatchObject({
    status: 'failed',
    settledFeeKobo: 500,
    returnedKobo: 100500,
  });
});
it('recovers a crash before provider submission using the original reference', async () => {
  const f = await fixture(),
    draft = await start(f);
  await service.confirm(f.user.id, f.session.id, {
    id: draft.id,
    code: await codeFor(draft.id),
  });
  await ledger.db.withdrawal.update({
    where: { id: draft.id },
    data: { status: 'processing', attemptedAt: new Date(Date.now() - 60000) },
  });
  const before = sends;
  await service.process(draft.id);
  await service.process(draft.id);
  expect(sends - before).toBe(1);
  expect((await service.get(f.user.id, draft.id)).status).toBe('pending');
});
it('does not guess stamp-duty refunds when the provider fee breakdown is ambiguous', async () => {
  const f = await fixture();
  await ledger.topup(
    {
      walletId: f.wallet.id,
      amountKobo: 1000000n,
      idempotencyKey: randomUUID(),
      reference: randomUUID(),
    },
    'bank',
  );
  const draft = await service.start(f.user.id, f.session.id, {
    bankId: f.account.id,
    amountKobo: 1000000,
    acceptedTotalKobo: 1007500,
    password: 'Example-password-384!',
    idempotencyKey: randomUUID(),
  });
  await service.confirm(f.user.id, f.session.id, {
    id: draft.id,
    code: await codeFor(draft.id),
  });
  await service.process(draft.id);
  const row = await ledger.db.withdrawal.findUniqueOrThrow({
      where: { id: draft.id },
    }),
    transfer = transfers.get(row.reference);
  if (!transfer) throw Error('Missing transfer');
  transfer.status = 'reversed';
  transfer.feeKobo = 0;
  await expect(service.process(draft.id)).rejects.toThrow();
  expect((await ledger.balances(f.wallet.id)).heldKobo).toBe(1007500n);
});
