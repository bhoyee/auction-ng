import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { randomUUID, createHmac } from 'node:crypto';
import { PaymentService } from '../src/payments/payment-service';
import type {
  PaymentProvider,
  VerifiedTransfer,
} from '../src/payments/payment-provider';
import { LedgerService } from '../src/ledger/ledger-service';
import { encryptPii, hashPii } from '../src/security/pii';
import { createApi } from '../src/app';

let ledger: LedgerService;
let payments: PaymentService;
const transfers = new Map<string, VerifiedTransfer>();
const accounts = new Map<
  string,
  {
    customerCode: string;
    bankName: string;
    accountNumber: string;
    identified: boolean;
  }
>();
const secret = 'local-payment-test-signature-secret';
const provider: PaymentProvider = {
  verifySignature(raw, signature) {
    return signature === createHmac('sha512', secret).update(raw).digest('hex');
  },
  async assignAccount(input) {
    accounts.set(input.email, {
      customerCode: `CUS_${randomUUID()}`,
      bankName: 'Test Bank',
      accountNumber: '9930000001',
      identified: true,
    });
  },
  async getAccount(email) {
    return accounts.get(email) ?? null;
  },
  async verifyTransfer(reference) {
    const value = transfers.get(reference);
    if (!value) throw new Error('Unknown test transfer');
    return value;
  },
  async listTransfers() {
    return [...transfers.keys()];
  },
};
beforeAll(() => {
  const url = process.env.LEDGER_TEST_DATABASE_URL;
  if (
    process.env.NODE_ENV !== 'test' ||
    !url ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname)
  )
    throw new Error('Isolated test database required');
  ledger = new LedgerService(url);
  payments = new PaymentService(ledger, provider);
});
afterAll(async () => {
  await ledger?.close();
});
async function buyer() {
  const email = `payments-${randomUUID()}@example.test`;
  const user = await ledger.db.user.create({
    data: {
      name: 'Payment test buyer',
      emailVerifiedAt: new Date(),
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
    },
  });
  const wallet = await ledger.openWallet(user.id);
  await payments.assignAccount(user.id, {
    firstName: 'Ada',
    lastName: 'Okafor',
    phone: `+234803${randomUUID().replace(/\D/g, '').padEnd(7, '0').slice(0, 7)}`,
    bvn: randomUUID().replace(/\D/g, '').padEnd(11, '0').slice(0, 11),
    bankCode: '007',
    accountNumber: '0123456789',
    consent: true,
    feePolicy: 'paystack-dva-v1',
  });
  const account = await ledger.db.virtualAccount.findFirstOrThrow({
    where: { userId: user.id },
  });
  return { user, wallet, account, email };
}
async function transfer() {
  const b = await buyer();
  const reference = randomUUID();
  transfers.set(reference, {
    reference,
    customerCode: b.account.customerCode ?? '',
    amountKobo: 1000000,
    feeKobo: 10000,
    currency: 'NGN',
    domain: 'test',
    status: 'success',
    channel: 'dedicated_nuban',
  });
  return { ...b, reference };
}
function event(reference: string) {
  const raw = Buffer.from(
    JSON.stringify({ event: 'charge.success', data: { reference } }),
  );
  return {
    raw,
    signature: createHmac('sha512', secret).update(raw).digest('hex'),
  };
}
it('credits the buyer net of fees once when three identical verified webhooks arrive concurrently', async () => {
  const b = await transfer();
  const e = event(b.reference);
  await Promise.all(
    Array.from({ length: 3 }, () => payments.webhook(e.raw, e.signature)),
  );
  expect(await ledger.balances(b.wallet.id)).toEqual({
    availableKobo: 990000n,
    heldKobo: 0n,
  });
  expect(
    await ledger.db.ledgerTransaction.count({
      where: { walletId: b.wallet.id },
    }),
  ).toBe(1);
  expect(
    await ledger.db.payment.findUnique({
      where: {
        provider_providerRef: {
          provider: 'paystack',
          providerRef: b.reference,
        },
      },
    }),
  ).toMatchObject({
    amountKobo: 1000000n,
    feeKobo: 10000n,
    creditKobo: 990000n,
    status: 'credited',
  });
});
it('recovers from a crash after ledger credit without charging or crediting twice', async () => {
  const b = await transfer();
  const e = event(b.reference);
  const originalUpdate = ledger.db.payment.update;
  const update = vi
    .spyOn(ledger.db.payment, 'update')
    .mockRejectedValueOnce(new Error('Simulated process interruption'));
  try {
    await expect(payments.webhook(e.raw, e.signature)).rejects.toThrow(
      'Simulated process interruption',
    );
  } finally {
    update.mockRestore();
    ledger.db.payment.update = originalUpdate;
  }
  expect((await ledger.balances(b.wallet.id)).availableKobo).toBe(990000n);
  await payments.webhook(e.raw, e.signature);
  expect(
    await ledger.db.ledgerTransaction.count({
      where: { walletId: b.wallet.id },
    }),
  ).toBe(1);
  const report = await payments.reconcile(
    new Date(Date.now() - 86400000),
    new Date(),
  );
  expect(
    report.mismatches.find((item) => item.reference === b.reference),
  ).toBeUndefined();
});
it('returns the received amount, actual fee and credited amount only in the owner history', async () => {
  const b = await transfer();
  const e = event(b.reference);
  await payments.webhook(e.raw, e.signature);
  expect((await payments.history(b.user.id, {})).items).toEqual([
    expect.objectContaining({
      transferKobo: 1000000,
      feeKobo: 10000,
      creditKobo: 990000,
      status: 'credited',
    }),
  ]);
  const other = await buyer();
  expect((await payments.history(other.user.id, {})).items).toHaveLength(0);
  await expect(
    payments.history(b.user.id, { cursor: 'bad' }),
  ).rejects.toThrow();
});
it('rejects missing consent before creating an account or sharing identity data', async () => {
  const b = await buyer();
  await expect(
    payments.assignAccount(b.user.id, {
      firstName: 'Ada',
      lastName: 'Okafor',
      phone: '+2348030000000',
      bvn: '20012345678',
      bankCode: '007',
      accountNumber: '0123456789',
      consent: false as true,
      feePolicy: 'paystack-dva-v1',
    }),
  ).rejects.toThrow();
});
it('accepts signed HTTP webhook retries and rejects a forged raw body', async () => {
  const b = await transfer();
  const e = event(b.reference);
  const app = await createApi({
    databaseUrl: process.env.LEDGER_TEST_DATABASE_URL,
    mode: 'local',
    emailProvider: { async sendCode() {} },
    paymentProvider: provider,
  });
  try {
    await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();
    const headers = {
      'Content-Type': 'application/json',
      'x-paystack-signature': e.signature,
    };
    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        fetch(`${url}/payments/webhook`, {
          method: 'POST',
          headers,
          body: e.raw.toString(),
        }),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(
      (
        await fetch(`${url}/payments/webhook`, {
          method: 'POST',
          headers,
          body: e.raw.toString() + ' ',
        })
      ).status,
    ).toBe(401);
    expect((await ledger.balances(b.wallet.id)).availableKobo).toBe(990000n);
  } finally {
    await app.close();
  }
});
it('rejects forged or modified webhook payloads without crediting', async () => {
  const b = await transfer();
  const e = event(b.reference);
  await expect(payments.webhook(e.raw, '0'.repeat(128))).rejects.toThrow();
  await expect(
    payments.webhook(
      Buffer.from(e.raw.toString().replace(b.reference, randomUUID())),
      e.signature,
    ),
  ).rejects.toThrow();
  expect((await ledger.balances(b.wallet.id)).availableKobo).toBe(0n);
});
it('rejects live, failed, foreign-currency, wrong-channel and unexpected-fee transfers', async () => {
  for (const changed of [
    { domain: 'live' },
    { status: 'failed' },
    { currency: 'USD' },
    { channel: 'card' },
    { feeKobo: 20000 },
    { customerCode: 'CUS_foreign' },
    { amountKobo: 0 },
  ]) {
    const b = await transfer();
    const original = transfers.get(b.reference);
    if (!original) throw new Error('Fixture missing');
    transfers.set(b.reference, { ...original, ...changed });
    const e = event(b.reference);
    await expect(payments.webhook(e.raw, e.signature)).rejects.toThrow();
    expect((await ledger.balances(b.wallet.id)).availableKobo).toBe(0n);
  }
});
it('reports missing credits during reconciliation without inventing wallet funds', async () => {
  const b = await transfer();
  const report = await payments.reconcile(
    new Date(Date.now() - 86400000),
    new Date(),
  );
  expect(report.mismatches.some((item) => item.reference === b.reference)).toBe(
    true,
  );
  expect((await ledger.balances(b.wallet.id)).availableKobo).toBe(0n);
});
it('requires explicit consent and keeps bank/BVN details encrypted', async () => {
  const b = await buyer();
  expect(b.account.consentedAt).toBeInstanceOf(Date);
  expect(
    Buffer.from(b.account.accountNumberCiphertext).toString(),
  ).not.toContain('9930000001');
  const user = await ledger.db.user.findUniqueOrThrow({
    where: { id: b.user.id },
  });
  expect(user.bvnHash).toHaveLength(64);
  expect(user.phoneVerifiedAt).toBeNull();
  expect(await payments.getAccount(b.user.id)).toMatchObject({
    accountNumber: '9930000001',
    testMode: true,
  });
});
