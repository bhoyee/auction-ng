import { beforeAll, afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { LedgerService } from '../src/ledger/ledger-service';
import { encryptPii, hashPii } from '../src/security/pii';
let ledger: LedgerService;
beforeAll(() => {
  const url = process.env.LEDGER_TEST_DATABASE_URL;
  if (!url || !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
    throw Error('Isolated database required');
  ledger = new LedgerService(url);
});
afterAll(async () => {
  await ledger?.close();
});
async function wallet() {
  const email = randomUUID() + '@example.test';
  const user = await ledger.db.user.create({
    data: {
      name: 'Synthetic buyer',
      emailCiphertext: encryptPii(email, 'email'),
      emailHash: hashPii(email, 'email'),
    },
  });
  return ledger.openWallet(user.id);
}
const command = (walletId: string, amountKobo: bigint) => ({
  walletId,
  amountKobo,
  idempotencyKey: randomUUID(),
  reference: randomUUID(),
});
it('allocates bank money first through holds, raises, releases, captures and partial refunds', async () => {
  const w = await wallet();
  await ledger.topup(command(w.id, 100000n), 'bank');
  await ledger.topup(command(w.id, 200000n));
  const holdId = randomUUID();
  await ledger.hold({ ...command(w.id, 150000n), holdId });
  expect(await ledger.bankFunds(w.id)).toEqual({
    availableKobo: 0n,
    heldKobo: 100000n,
  });
  const capture = await ledger.captureHold({
    ...command(w.id, 70000n),
    holdId,
  });
  expect(await ledger.bankFunds(w.id)).toEqual({
    availableKobo: 30000n,
    heldKobo: 0n,
  });
  await ledger.refund({
    ...command(w.id, 30000n),
    sourceTransactionId: capture.id,
  });
  expect((await ledger.bankFunds(w.id)).availableKobo).toBe(60000n);
  const next = randomUUID();
  await ledger.hold({ ...command(w.id, 40000n), holdId: next });
  await ledger.hold({ ...command(w.id, 80000n), holdId: next });
  await ledger.releaseHold({
    walletId: w.id,
    holdId: next,
    idempotencyKey: randomUUID(),
    reference: randomUUID(),
  });
  expect((await ledger.bankFunds(w.id)).availableKobo).toBe(60000n);
});
it('does not reclassify legacy or card credit on a retry, and restores payout source once', async () => {
  const w = await wallet();
  const legacy = command(w.id, 100000n);
  await ledger.topup(legacy);
  await ledger.topup(legacy, 'bank');
  expect((await ledger.bankFunds(w.id)).availableKobo).toBe(0n);
  await ledger.topup(command(w.id, 100000n), 'bank');
  const payout = await ledger.payout(command(w.id, 50000n));
  const refund = { ...command(w.id, 50000n), sourceTransactionId: payout.id };
  await Promise.all([
    ledger.reversePayout(refund),
    ledger.reversePayout(refund),
  ]);
  expect((await ledger.bankFunds(w.id)).availableKobo).toBe(100000n);
});
it('captures bank funds first across several mixed-source reservations', async () => {
  const w = await wallet();
  await ledger.topup(command(w.id, 20000n), 'bank');
  await ledger.topup(command(w.id, 80000n));
  const first = randomUUID();
  await ledger.hold({ ...command(w.id, 100000n), holdId: first });
  await ledger.topup(command(w.id, 10000n), 'bank');
  const second = randomUUID();
  await ledger.hold({ ...command(w.id, 10000n), holdId: second });
  await ledger.db.$transaction((tx) =>
    ledger.captureGroupInTransaction(tx, {
      walletId: w.id,
      holdIds: [first, second],
      amountKobo: 50000n,
      idempotencyKey: randomUUID(),
    }),
  );
  expect(await ledger.bankFunds(w.id)).toEqual({
    availableKobo: 0n,
    heldKobo: 0n,
  });
  expect((await ledger.balances(w.id)).availableKobo).toBe(60000n);
});
