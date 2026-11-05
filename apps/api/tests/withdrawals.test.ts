import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { LedgerService } from '../src/ledger/ledger-service';
import { WithdrawalService } from '../src/withdrawals/withdrawal-service';
import { AuthService } from '../src/auth/auth-service';
import { decryptPii, encryptPii, hashPii } from '../src/security/pii';
import { hashStaffPassword } from '../src/auth/staff-crypto';
import type { PaymentProvider } from '../src/payments/payment-provider';
import { PayoutSetupError } from '../src/payments/payment-provider';
import { createApi } from '../src/app';
import { WalletControlsService } from '../src/payments/wallet-controls-service';
import { PaymentService } from '../src/payments/payment-service';
import { withdrawalAttempt } from '../../mobile/lib/withdrawal-attempt';
let ledger: LedgerService, auth: AuthService, service: WithdrawalService;
const codes = new Map<string, string>();
const transfers = new Map<
  string,
  { recipientCode: string; amountKobo: number; status: string; feeKobo: number }
>();
let sends = 0,
  timeout = false,
  setupBlocked = false;
beforeAll(async () => {
  const url =
    process.env.WITHDRAWALS_TEST_DATABASE_URL ??
    process.env.LEDGER_TEST_DATABASE_URL;
  if (!url || !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
    throw Error('Isolated database required');
  ledger = new LedgerService(url);
  auth = new AuthService({
    databaseUrl: url,
    mode: 'local',
    emailProvider: {
      async sendCode(email, code, purpose) {
        expect(['withdraw', 'bank-change']).toContain(purpose);
        codes.set(email, code);
      },
    },
  });
  const provider = {
    async initializeCard() {
      throw Error('Unexpected card checkout');
    },
    verifySignature() {
      return false;
    },
    async assignAccount() {
      throw Error('Unexpected account assignment');
    },
    async getAccount() {
      return null;
    },
    async verifyTransfer() {
      throw Error('Unexpected incoming transfer lookup');
    },
    async listTransfers() {
      return [];
    },
    async resolvePayoutAccount() {
      return { accountName: 'Synthetic buyer', bankName: 'Synthetic bank' };
    },
    async payoutCustomer(email: string) {
      return 'CUS_' + email.split('@')[0]?.replaceAll('-', '');
    },
    async validatePayoutCustomer() {},
    async verifyPayoutCustomer() {
      return true;
    },
    async sendPayout(input) {
      sends++;
      if (setupBlocked) throw new PayoutSetupError();
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
  } satisfies PaymentProvider;
  service = new WithdrawalService(ledger, auth, provider, {
    enabled: true,
  });
});
async function bankFixture() {
  const f = await fixture();
  const bvn = String(
    (BigInt('0x' + randomBytes(5).toString('hex')) % 90000000000n) +
      10000000000n,
  );
  await ledger.db.user.update({
    where: { id: f.user.id },
    data: {
      bvnHash: hashPii(bvn, 'bvn'),
      bvnCiphertext: encryptPii(bvn, 'bvn'),
    },
  });
  return {
    ...f,
    bvn,
    newNumber: String(
      (BigInt('0x' + randomBytes(5).toString('hex')) % 9000000000n) +
        1000000000n,
    ),
  };
}
function changeInput(f: Awaited<ReturnType<typeof bankFixture>>) {
  return {
    bankCode: '09',
    accountNumber: f.newNumber,
    password: 'Example-password-384!',
    consent: true as const,
    idempotencyKey: randomUUID(),
  };
}
it('changes banks only after a bound email code and matching provider identity, retaining frozen history', async () => {
  const f = await bankFixture();
  const originalKey = randomUUID();
  const withdrawal = await start(f, originalKey);
  const code = codes.get(f.email);
  if (!code) throw Error('Missing code');
  await service.confirm(f.user.id, f.session.id, { id: withdrawal.id, code });
  await service.process(withdrawal.id);
  const payoutRow = await ledger.db.withdrawal.findUniqueOrThrow({
    where: { id: withdrawal.id },
  });
  const payout = transfers.get(payoutRow.reference);
  if (!payout) throw Error('Missing transfer');
  payout.status = 'success';
  await service.process(withdrawal.id);
  const oldDraft = await start(f),
    oldDraftCode = codes.get(f.email);
  const input = changeInput(f);
  const challenge = await service.startBankChange(
    f.user.id,
    f.session.id,
    input,
  );
  await expect(
    service.startBankChange(f.user.id, f.session.id, {
      ...input,
      accountNumber: '1111111111',
    }),
  ).rejects.toThrow();
  await expect(
    service.confirmBankChange(randomUUID(), f.session.id, {
      id: challenge.id,
      code: '000000',
    }),
  ).rejects.toThrow();
  const otp = codes.get(f.email);
  if (!otp) throw Error('Missing bank change code');
  await service.confirmBankChange(f.user.id, f.session.id, {
    id: challenge.id,
    code: otp,
  });
  expect((await service.overview(f.user.id)).bank?.id).toBe(f.account.id);
  const changing = await ledger.db.withdrawalBankChange.findUniqueOrThrow({
    where: { id: challenge.id },
  });
  const callback = {
    customer_code: changing.customerCode,
    identification: {
      country: 'NG',
      type: 'bank_account',
      bank_code: '09',
      account_number: f.newNumber,
      bvn: f.bvn,
    },
  };
  await expect(
    service.providerEvent('customeridentification.success', {
      ...callback,
      identification: { ...callback.identification, bvn: '99999999999' },
    }),
  ).rejects.toThrow();
  await service.providerEvent('customeridentification.success', callback);
  await service.providerEvent('customeridentification.success', callback);
  const overview = await service.overview(f.user.id);
  expect(overview.bank?.id).not.toBe(f.account.id);
  expect(overview.bank?.accountLast4).toBe(f.newNumber.slice(-4));
  expect(
    (
      await ledger.db.withdrawal.findUniqueOrThrow({
        where: { id: withdrawal.id },
      })
    ).bankId,
  ).toBe(f.account.id);
  expect(
    (
      await ledger.db.withdrawalBank.findUniqueOrThrow({
        where: { id: f.account.id },
      })
    ).detailsCiphertext,
  ).toEqual(f.account.detailsCiphertext);
  expect(
    (await service.startBankChange(f.user.id, f.session.id, input)).status,
  ).toBe('complete');
  expect((await start(f, originalKey)).id).toBe(withdrawal.id);
  expect(
    (
      await service.confirm(f.user.id, f.session.id, {
        id: withdrawal.id,
        code,
      })
    ).status,
  ).toBe('success');
  if (!oldDraftCode) throw Error('Missing original-bank code');
  await expect(
    service.confirm(f.user.id, f.session.id, {
      id: oldDraft.id,
      code: oldDraftCode,
    }),
  ).rejects.toThrow();
});
it('serializes bank changes against withdrawal confirmation and blocks old-bank drafts after a switch begins', async () => {
  const f = await bankFixture();
  const draft = await start(f),
    withdrawalCode = codes.get(f.email);
  const change = await service.startBankChange(
    f.user.id,
    f.session.id,
    changeInput(f),
  );
  const changeCode = codes.get(f.email);
  if (!withdrawalCode || !changeCode) throw Error('Missing codes');
  const outcomes = await Promise.allSettled([
    service.confirmBankChange(f.user.id, f.session.id, {
      id: change.id,
      code: changeCode,
    }),
    service.confirm(f.user.id, f.session.id, {
      id: draft.id,
      code: withdrawalCode,
    }),
  ]);
  expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(
    1,
  );
  const held = (await ledger.balances(f.wallet.id)).heldKobo;
  const state = await service.getBankChange(f.user.id, change.id);
  expect(state.status === 'verifying' ? held === 0n : held === 101000n).toBe(
    true,
  );
});
it('rejects outstanding withdrawals, wrong codes, changed credentials and other sessions for bank changes', async () => {
  const f = await bankFixture();
  const change = await service.startBankChange(
    f.user.id,
    f.session.id,
    changeInput(f),
  );
  const code = codes.get(f.email);
  if (!code) throw Error('Missing code');
  await expect(
    service.confirmBankChange(f.user.id, randomUUID(), { id: change.id, code }),
  ).rejects.toThrow();
  await expect(
    service.confirmBankChange(f.user.id, f.session.id, {
      id: change.id,
      code: code === '000000' ? '111111' : '000000',
    }),
  ).rejects.toThrow();
  await ledger.db.user.update({
    where: { id: f.user.id },
    data: {
      buyerPasswordHash: await hashStaffPassword('Changed-password-384!'),
    },
  });
  await expect(
    service.confirmBankChange(f.user.id, f.session.id, { id: change.id, code }),
  ).rejects.toThrow();
  const other = await bankFixture();
  const draft = await start(other),
    otp = codes.get(other.email);
  if (!otp) throw Error('Missing code');
  await service.confirm(other.user.id, other.session.id, {
    id: draft.id,
    code: otp,
  });
  await expect(
    service.startBankChange(
      other.user.id,
      other.session.id,
      changeInput(other),
    ),
  ).rejects.toThrow();
});
it('expires bank-change codes, caps attempts and preserves one draft after uncertain email delivery', async () => {
  const f = await bankFixture(),
    input = changeInput(f);
  const delivery = vi
    .spyOn(auth, 'sendBankChangeCode')
    .mockRejectedValueOnce(Error('Synthetic SMTP timeout'));
  await expect(
    service.startBankChange(f.user.id, f.session.id, input),
  ).rejects.toThrow();
  const draft = await service.startBankChange(f.user.id, f.session.id, input);
  delivery.mockRestore();
  expect(
    await ledger.db.withdrawalBankChange.count({
      where: { userId: f.user.id },
    }),
  ).toBe(1);
  const code = codes.get(f.email);
  if (!code) throw Error('Missing code');
  for (let i = 0; i < 5; i++)
    await expect(
      service.confirmBankChange(f.user.id, f.session.id, {
        id: draft.id,
        code: code === '000000' ? '111111' : '000000',
      }),
    ).rejects.toThrow();
  await expect(
    service.confirmBankChange(f.user.id, f.session.id, { id: draft.id, code }),
  ).rejects.toThrow();
  expect((await service.getBankChange(f.user.id, draft.id)).status).toBe(
    'expired',
  );
  const next = await service.startBankChange(f.user.id, f.session.id, {
    ...input,
    idempotencyKey: randomUUID(),
  });
  const nextCode = codes.get(f.email);
  if (!nextCode) throw Error('Missing code');
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(Date.now() + 360000);
    await expect(
      service.confirmBankChange(f.user.id, f.session.id, {
        id: next.id,
        code: nextCode,
      }),
    ).rejects.toThrow('expired');
  } finally {
    vi.useRealTimers();
  }
});
it('cancels pending bank verification after a password reset without changing the selected account', async () => {
  const f = await bankFixture();
  const draft = await service.startBankChange(
    f.user.id,
    f.session.id,
    changeInput(f),
  );
  const code = codes.get(f.email);
  if (!code) throw Error('Missing code');
  await service.confirmBankChange(f.user.id, f.session.id, {
    id: draft.id,
    code,
  });
  await ledger.db.user.update({
    where: { id: f.user.id },
    data: { buyerPasswordHash: await hashStaffPassword('New-password-567!') },
  });
  expect((await service.overview(f.user.id)).bankChange).toBeNull();
  expect((await service.getBankChange(f.user.id, draft.id)).status).toBe(
    'rejected',
  );
  expect((await service.overview(f.user.id)).bank?.id).toBe(f.account.id);
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
it('pauses new withdrawals while allowing an existing draft confirmation and transfer to finish', async () => {
  const controls = new WalletControlsService(ledger),
    f = await fixture(),
    draft = await start(f);
  const adminEmail = randomUUID() + '@example.test';
  const admin = await ledger.db.user.create({
    data: {
      name: 'Synthetic controls admin',
      role: 'admin',
      emailHash: hashPii(adminEmail, 'email'),
      emailCiphertext: encryptPii(adminEmail, 'email'),
    },
  });
  const before = await controls.read();
  const paused = await controls.update(admin.id, {
    depositsEnabled: true,
    withdrawalsEnabled: false,
    expectedRevision: before.revision,
    reason: 'Withdrawal maintenance',
    idempotencyKey: randomUUID(),
  });
  try {
    expect((await service.overview(f.user.id)).enabled).toBe(false);
    await expect(start(f)).rejects.toThrow();
    await expect(service.quoteForBuyer(f.user.id, 100000)).rejects.toThrow();
    expect(
      (
        await service.start(f.user.id, f.session.id, {
          bankId: f.account.id,
          amountKobo: 100000,
          acceptedTotalKobo: 101000,
          password: 'Example-password-384!',
          idempotencyKey: (
            await ledger.db.withdrawal.findUniqueOrThrow({
              where: { id: draft.id },
            })
          ).requestKey,
        })
      ).id,
    ).toBe(draft.id);
    await service.confirm(f.user.id, f.session.id, {
      id: draft.id,
      code: await codeFor(draft.id),
    });
    await service.process(draft.id);
    const row = await ledger.db.withdrawal.findUniqueOrThrow({
        where: { id: draft.id },
      }),
      remote = transfers.get(row.reference);
    if (!remote) throw Error('Missing transfer');
    remote.status = 'success';
    await service.process(draft.id);
    expect((await service.get(f.user.id, draft.id)).status).toBe('success');
  } finally {
    await controls.update(admin.id, {
      depositsEnabled: true,
      withdrawalsEnabled: true,
      expectedRevision: paused.revision,
      reason: 'Resume after test',
      idempotencyKey: randomUUID(),
    });
  }
});
it('serializes new withdrawal admission against a global pause', async () => {
  const controls = new WalletControlsService(ledger),
    f = await fixture();
  const email = randomUUID() + '@example.test';
  const admin = await ledger.db.user.create({
    data: {
      name: 'Synthetic race admin',
      role: 'admin',
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
    },
  });
  const before = await controls.read();
  const results = await Promise.allSettled([
    start(f),
    controls.update(admin.id, {
      depositsEnabled: true,
      withdrawalsEnabled: false,
      expectedRevision: before.revision,
      reason: 'Concurrent withdrawal maintenance',
      idempotencyKey: randomUUID(),
    }),
  ]);
  try {
    expect(results[1]?.status).toBe('fulfilled');
    expect(
      await ledger.db.withdrawal.count({ where: { userId: f.user.id } }),
    ).toBe(results[0]?.status === 'fulfilled' ? 1 : 0);
    await expect(start(f)).rejects.toThrow();
    expect((await ledger.balances(f.wallet.id)).heldKobo).toBe(0n);
  } finally {
    const current = await controls.read();
    await controls.update(admin.id, {
      depositsEnabled: true,
      withdrawalsEnabled: true,
      expectedRevision: current.revision,
      reason: 'Resume after race test',
      idempotencyKey: randomUUID(),
    });
  }
});
it('admits simultaneous deposits and withdrawals without deadlocking an admin pause', async () => {
  const controls = new WalletControlsService(ledger),
    f = await fixture(),
    email = randomUUID() + '@example.test';
  const admin = await ledger.db.user.create({
    data: {
      name: 'Synthetic parallel admin',
      role: 'admin',
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
    },
  });
  const payments = new PaymentService(ledger, {
    async initializeCard(input) {
      return {
        authorizationUrl: 'https://checkout.paystack.com/' + input.reference,
      };
    },
    verifySignature() {
      return false;
    },
    async assignAccount() {
      throw Error('Unexpected DVA');
    },
    async getAccount() {
      return null;
    },
    async verifyTransfer() {
      throw Error('Unexpected payment confirmation');
    },
    async listTransfers() {
      return [];
    },
  });
  const before = await controls.read();
  try {
    const results = await Promise.allSettled([
      payments.initializeCard(f.user.id, {
        amountKobo: 1000000,
        cardType: 'local',
        feePolicy: 'paystack-card-local-v1',
        acceptedFeeKobo: 25000,
        acceptedCreditKobo: 975000,
        consent: true,
        idempotencyKey: randomUUID(),
      }),
      start(f),
      controls.update(admin.id, {
        depositsEnabled: false,
        withdrawalsEnabled: false,
        expectedRevision: before.revision,
        reason: 'Concurrent wallet maintenance',
        idempotencyKey: randomUUID(),
      }),
    ]);
    expect(results[2]?.status).toBe('fulfilled');
    for (const result of results.slice(0, 2))
      if (result.status === 'rejected')
        expect(String(result.reason)).toContain('temporarily paused');
    expect((await ledger.balances(f.wallet.id)).heldKobo).toBe(0n);
  } finally {
    const current = await controls.read();
    await controls.update(admin.id, {
      depositsEnabled: true,
      withdrawalsEnabled: true,
      expectedRevision: current.revision,
      reason: 'Resume after concurrency test',
      idempotencyKey: randomUUID(),
    });
  }
});
it('cancels an owned draft idempotently without moving funds or sending a transfer', async () => {
  const f = await fixture(),
    draft = await start(f),
    code = codes.get(f.email);
  await expect(service.cancel(randomUUID(), draft.id)).rejects.toThrow();
  const before = await ledger.balances(f.wallet.id),
    sent = sends;
  const receipts = await Promise.all(
    [1, 2, 3].map(() => service.cancel(f.user.id, draft.id)),
  );
  expect(receipts.every((row) => row.status === 'cancelled')).toBe(true);
  expect(await ledger.balances(f.wallet.id)).toEqual(before);
  if (!code) throw Error('Missing code');
  expect(
    (await service.confirm(f.user.id, f.session.id, { id: draft.id, code }))
      .status,
  ).toBe('cancelled');
  await service.process(draft.id);
  expect(sends).toBe(sent);
});
it('releases an under-review withdrawal reservation exactly once with no retained fees', async () => {
  const f = await fixture(false),
    draft = await start(f),
    code = codes.get(f.email);
  if (!code) throw Error('Missing code');
  await service.confirm(f.user.id, f.session.id, { id: draft.id, code });
  const receipts = await Promise.all(
    [1, 2, 3].map(() => service.cancel(f.user.id, draft.id)),
  );
  expect(receipts[0]).toMatchObject({
    status: 'cancelled',
    settledFeeKobo: 0,
    returnedKobo: 101000,
  });
  expect(await ledger.balances(f.wallet.id)).toMatchObject({
    availableKobo: 1000000n,
    heldKobo: 0n,
  });
  expect(
    await ledger.db.ledgerTransaction.count({
      where: { idempotencyKey: `withdraw:cancel:${draft.id}` },
    }),
  ).toBe(1);
  expect(
    await ledger.db.notification.count({
      where: {
        userId: f.user.id,
        reference: `withdrawal:${draft.id}:cancelled`,
      },
    }),
  ).toBe(1);
});
it('serializes cancellation against finance approval and protects approved automatic withdrawals', async () => {
  const f = await fixture(false),
    draft = await start(f),
    code = codes.get(f.email);
  if (!code) throw Error('Missing code');
  await service.confirm(f.user.id, f.session.id, { id: draft.id, code });
  const finance = await ledger.db.user.create({
    data: {
      name: 'Synthetic finance',
      role: 'finance',
      emailHash: hashPii(randomUUID() + '@example.test', 'email'),
      emailCiphertext: encryptPii('finance@example.test', 'email'),
    },
  });
  const outcomes = await Promise.allSettled([
    service.cancel(f.user.id, draft.id),
    service.review(finance.id, draft.id, true, 'Synthetic approval'),
  ]);
  expect(outcomes.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
  const result = await service.get(f.user.id, draft.id),
    balance = await ledger.balances(f.wallet.id);
  expect(
    result.status === 'cancelled'
      ? balance.heldKobo === 0n
      : result.status === 'queued' && balance.heldKobo === 101000n,
  ).toBe(true);
  const automatic = await fixture(),
    approved = await start(automatic),
    automaticCode = codes.get(automatic.email);
  if (!automaticCode) throw Error('Missing code');
  await service.confirm(automatic.user.id, automatic.session.id, {
    id: approved.id,
    code: automaticCode,
  });
  await expect(service.cancel(automatic.user.id, approved.id)).rejects.toThrow(
    'approved',
  );
  expect((await ledger.balances(automatic.wallet.id)).heldKobo).toBe(101000n);
});
it('serializes draft cancellation against confirmation without releasing approved funds', async () => {
  const f = await fixture(),
    draft = await start(f),
    code = codes.get(f.email);
  if (!code) throw Error('Missing code');
  await Promise.allSettled([
    service.cancel(f.user.id, draft.id),
    service.confirm(f.user.id, f.session.id, { id: draft.id, code }),
  ]);
  const receipt = await service.get(f.user.id, draft.id),
    balance = await ledger.balances(f.wallet.id);
  expect(
    receipt.status === 'cancelled'
      ? balance.heldKobo === 0n
      : receipt.status === 'queued' && balance.heldKobo === 101000n,
  ).toBe(true);
});
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
it('reports provider account setup without releasing funds and recovers once using the same reference', async () => {
  const f = await fixture();
  const draft = await service.start(f.user.id, f.session.id, {
    bankId: f.account.id,
    amountKobo: 100000,
    acceptedTotalKobo: 101000,
    password: 'Example-password-384!',
    idempotencyKey: randomUUID(),
  });
  await service.confirm(f.user.id, f.session.id, {
    id: draft.id,
    code: await codeFor(draft.id),
  });
  setupBlocked = true;
  try {
    await service.process(draft.id);
    const blocked = await service.get(f.user.id, draft.id);
    expect(blocked.status).toBe('pending');
    expect(blocked.processingIssue).toBe('provider_account');
    expect((await ledger.balances(f.wallet.id)).heldKobo).toBe(101000n);
    const original = await ledger.db.withdrawal.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(transfers.has(original.reference)).toBe(false);
    setupBlocked = false;
    await ledger.db.withdrawal.update({
      where: { id: draft.id },
      data: { attemptedAt: original.attemptedAt },
    });
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 31000);
    try {
      await service.process(draft.id);
    } finally {
      vi.restoreAllMocks();
    }
    const transfer = transfers.get(original.reference);
    if (!transfer) throw Error('Missing retried transfer');
    transfer.status = 'success';
    await Promise.all([service.process(draft.id), service.process(draft.id)]);
    const result = await service.get(f.user.id, draft.id);
    expect(result.status).toBe('success');
    expect(result.processingIssue).toBeNull();
    expect((await ledger.balances(f.wallet.id)).heldKobo).toBe(0n);
    expect(
      await ledger.db.ledgerTransaction.count({
        where: { reference: `withdraw:pay:${draft.id}` },
      }),
    ).toBe(1);
  } finally {
    setupBlocked = false;
  }
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
    databaseUrl:
      process.env.WITHDRAWALS_TEST_DATABASE_URL ??
      process.env.LEDGER_TEST_DATABASE_URL,
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

it('requires an enrolled authenticator after withdrawal email verification and preserves exactly-once holds under concurrent retries', async () => {
  const { newTotpSecret, totpCode } = await import('../src/auth/staff-crypto');
  const f = await fixture(),
    secret = newTotpSecret();
  await ledger.db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: f.user.id },
      data: { authenticatorEnabled: true },
    });
    await tx.buyerAuthenticator.create({
      data: {
        userId: f.user.id,
        secretCiphertext: encryptPii(secret, 'buyer-totp'),
      },
    });
  });
  const draft = await start(f),
    code = codes.get(f.email);
  if (!code) throw Error('Missing email code');
  const before = await ledger.balances(f.wallet.id);
  await expect(
    service.confirm(f.user.id, f.session.id, { id: draft.id, code }),
  ).rejects.toMatchObject({ status: 422 });
  expect(await ledger.balances(f.wallet.id)).toEqual(before);
  const input = {
    id: draft.id,
    code,
    factor: {
      method: 'authenticator' as const,
      code: totpCode(secret, Math.floor(Date.now() / 30000)),
    },
  };
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      service.confirm(f.user.id, f.session.id, input),
    ),
  );
  expect(results.every((row) => row.id === draft.id)).toBe(true);
  expect((await ledger.balances(f.wallet.id)).heldKobo).toBe(101000n);
  const second = await start(f),
    secondCode = codes.get(f.email);
  if (!secondCode) throw Error('Missing second email');
  await expect(
    service.confirm(f.user.id, f.session.id, {
      ...input,
      id: second.id,
      code: secondCode,
    }),
  ).rejects.toThrow();
  expect((await ledger.balances(f.wallet.id)).heldKobo).toBe(101000n);
});

it('does not switch an enrolled buyer bank without the additional factor after a valid email code', async () => {
  const { newTotpSecret, totpCode } = await import('../src/auth/staff-crypto');
  const f = await bankFixture(),
    secret = newTotpSecret();
  await ledger.db.user.update({
    where: { id: f.user.id },
    data: { authenticatorEnabled: true },
  });
  await ledger.db.buyerAuthenticator.create({
    data: {
      userId: f.user.id,
      secretCiphertext: encryptPii(secret, 'buyer-totp'),
    },
  });
  const change = await service.startBankChange(
    f.user.id,
    f.session.id,
    changeInput(f),
  );
  const code = codes.get(f.email);
  if (!code) throw Error('Missing code');
  await expect(
    service.confirmBankChange(f.user.id, f.session.id, { id: change.id, code }),
  ).rejects.toMatchObject({ status: 422 });
  expect((await service.overview(f.user.id)).bank?.id).toBe(f.account.id);
  await service.confirmBankChange(f.user.id, f.session.id, {
    id: change.id,
    code,
    factor: {
      method: 'authenticator',
      code: totpCode(secret, Math.floor(Date.now() / 30000)),
    },
  });
});

it('corrects withdrawal password while preserving one draft across concurrent exact retries', async () => {
  const f = await fixture();
  const before = await ledger.balances(f.wallet.id);
  const sendsBefore = sends;
  const attempt = {
    bankId: f.account.id,
    amountKobo: 100000,
    acceptedTotalKobo: 101000,
    password: 'Synthetic-incorrect-384!',
    idempotencyKey: randomUUID(),
  };
  await expect(service.start(f.user.id, f.session.id, attempt)).rejects.toThrow(
    'Check your password',
  );
  expect(
    await ledger.db.withdrawal.count({ where: { userId: f.user.id } }),
  ).toBe(0);
  const corrected = withdrawalAttempt(attempt, {
    ...attempt,
    password: 'Example-password-384!',
  });
  const [first, second] = await Promise.all([
    service.start(f.user.id, f.session.id, corrected),
    service.start(f.user.id, f.session.id, corrected),
  ]);
  expect(first.id).toBe(second.id);
  expect((await service.start(f.user.id, f.session.id, corrected)).id).toBe(
    first.id,
  );
  expect(
    await ledger.db.withdrawal.count({ where: { userId: f.user.id } }),
  ).toBe(1);
  expect(await ledger.balances(f.wallet.id)).toEqual(before);
  const wrongCode = codes.get(f.email) === '000000' ? '111111' : '000000';
  await expect(
    service.confirm(f.user.id, f.session.id, { id: first.id, code: wrongCode }),
  ).rejects.toThrow();
  expect(await ledger.balances(f.wallet.id)).toEqual(before);
  expect(sends).toBe(sendsBefore);
});

async function rotatedWithdrawal() {
  const f = await fixture();
  const deviceId = randomUUID(),
    refreshToken = randomBytes(32).toString('base64url');
  await ledger.db.authSession.update({
    where: { id: f.session.id },
    data: {
      client: 'mobile',
      deviceHash: hashPii(`mobile:${deviceId}`, 'auth-device'),
      refreshHash: hashPii(refreshToken, 'auth-token'),
    },
  });
  const draft = await start(f),
    code = codes.get(f.email);
  if (!code) throw Error('Missing synthetic withdrawal code');
  const tokens = await auth.refresh(
    { client: 'mobile', deviceId },
    refreshToken,
    'rotation-test',
  );
  const current = await ledger.db.authSession.findUniqueOrThrow({
    where: { accessHash: hashPii(tokens.accessToken, 'auth-token') },
  });
  return { ...f, draft, code, deviceId, refreshToken, tokens, current };
}

it('withdrawal rotation accepts a real token refresh with concurrent exactly-once confirmation', async () => {
  const f = await rotatedWithdrawal();
  const { newTotpSecret, totpCode } = await import('../src/auth/staff-crypto');
  const secret = newTotpSecret();
  await ledger.db.user.update({
    where: { id: f.user.id },
    data: { authenticatorEnabled: true },
  });
  await ledger.db.buyerAuthenticator.create({
    data: {
      userId: f.user.id,
      secretCiphertext: encryptPii(secret, 'buyer-totp'),
    },
  });
  const before = await ledger.balances(f.wallet.id),
    input = { id: f.draft.id, code: f.code };
  await expect(
    service.confirm(f.user.id, f.current.id, input),
  ).rejects.toMatchObject({ status: 422 });
  const badCode = f.code === '000000' ? '000001' : '000000';
  await expect(
    service.confirm(f.user.id, f.current.id, { ...input, code: badCode }),
  ).rejects.toMatchObject({ status: 400 });
  expect(await ledger.balances(f.wallet.id)).toEqual(before);
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      service.confirm(f.user.id, f.current.id, {
        ...input,
        factor: {
          method: 'authenticator',
          code: totpCode(secret, Math.floor(Date.now() / 30000)),
        },
      }),
    ),
  );
  expect(
    results.every((r) => r.id === f.draft.id && r.status === 'queued'),
  ).toBe(true);
  expect((await ledger.balances(f.wallet.id)).heldKobo).toBe(101000n);
  expect(
    (
      await ledger.db.withdrawal.findUniqueOrThrow({
        where: { id: f.draft.id },
      })
    ).sessionId,
  ).toBe(f.session.id);
});

it.each([
  'family',
  'device',
  'client',
  'expired',
  'revoked',
  'version',
  'password',
  'origin-expired',
  'origin-version',
  'no-mfa',
] as const)(
  'withdrawal rotation rejects %s changes without reserving funds',
  async (change) => {
    const f = await rotatedWithdrawal(),
      before = await ledger.balances(f.wallet.id);
    if (change === 'family')
      await ledger.db.authSession.update({
        where: { id: f.current.id },
        data: { familyId: randomUUID() },
      });
    if (change === 'device')
      await ledger.db.authSession.update({
        where: { id: f.current.id },
        data: { deviceHash: '1'.repeat(64) },
      });
    if (change === 'client')
      await ledger.db.authSession.update({
        where: { id: f.current.id },
        data: { client: 'web' },
      });
    if (change === 'expired')
      await ledger.db.authSession.update({
        where: { id: f.current.id },
        data: {
          createdAt: new Date(0),
          expiresAt: new Date(1000),
          accessExpiresAt: new Date(1000),
        },
      });
    if (change === 'revoked')
      await auth.logout(
        { client: 'mobile', deviceId: f.deviceId },
        f.tokens.refreshToken,
        'rotation-test',
      );
    if (change === 'version')
      await ledger.db.user.update({
        where: { id: f.user.id },
        data: { authenticatorVersion: { increment: 1 } },
      });
    if (change === 'password')
      await ledger.db.user.update({
        where: { id: f.user.id },
        data: {
          buyerPasswordHash: await hashStaffPassword(
            'Changed-synthetic-password-384!',
          ),
        },
      });
    if (change === 'origin-expired')
      await ledger.db.authSession.update({
        where: { id: f.session.id },
        data: {
          createdAt: new Date(0),
          expiresAt: new Date(1000),
          accessExpiresAt: new Date(1000),
        },
      });
    if (change === 'origin-version')
      await ledger.db.authSession.update({
        where: { id: f.session.id },
        data: { authenticatorVersion: 1 },
      });
    if (change === 'no-mfa')
      await ledger.db.authSession.update({
        where: { id: f.current.id },
        data: { buyerMfa: false },
      });
    await expect(
      service.confirm(f.user.id, f.current.id, {
        id: f.draft.id,
        code: f.code,
      }),
    ).rejects.toThrow();
    expect(await ledger.balances(f.wallet.id)).toEqual(before);
    expect(
      (
        await ledger.db.withdrawal.findUniqueOrThrow({
          where: { id: f.draft.id },
        })
      ).holdId,
    ).toBeNull();
  },
);

it('withdrawal rotation rejects the successor after refresh-token replay revokes its family', async () => {
  const f = await rotatedWithdrawal(),
    before = await ledger.balances(f.wallet.id);
  await expect(
    auth.refresh(
      { client: 'mobile', deviceId: f.deviceId },
      f.refreshToken,
      'rotation-test',
    ),
  ).rejects.toThrow();
  await expect(
    service.confirm(f.user.id, f.current.id, { id: f.draft.id, code: f.code }),
  ).rejects.toThrow();
  expect(await ledger.balances(f.wallet.id)).toEqual(before);
});
