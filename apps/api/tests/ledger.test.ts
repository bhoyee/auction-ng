import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { LedgerService } from '../src/ledger/ledger-service';
import {
  InsufficientFundsError,
  LedgerConflictError,
  InvalidHoldError,
  InvalidRefundError,
} from '../src/ledger/ledger-errors';
import { encryptPii, hashPii } from '../src/security/pii';
import { exerciseWalletConstraints } from '../src/ledger/wallet-constraint-fixtures';

let ledger: LedgerService;
const command = (walletId: string) => ({
  walletId,
  idempotencyKey: randomUUID(),
  reference: randomUUID(),
});
async function wallet() {
  const email = `ledger-${randomUUID()}@example.test`;
  const user = await ledger.db.user.create({
    data: {
      name: 'Ledger test buyer',
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
    },
  });
  return ledger.openWallet(user.id);
}
async function funded(amount = 100000n) {
  const result = await wallet();
  await ledger.topup({ ...command(result.id), amountKobo: amount });
  return result;
}
async function balances(walletId: string, available: bigint, held: bigint) {
  expect(await ledger.balances(walletId)).toEqual({
    availableKobo: available,
    heldKobo: held,
  });
  const rows = await ledger.db.$queryRaw<
    { kind: string; amount: bigint }[]
  >`SELECT a.kind,COALESCE(SUM(CASE WHEN e.side='credit' THEN e.amount_kobo ELSE -e.amount_kobo END),0)::bigint AS amount FROM ledger_accounts a LEFT JOIN ledger_entries e ON e.account_id=a.id WHERE a.wallet_id=${walletId}::uuid GROUP BY a.kind`;
  expect(rows.find((row) => row.kind === 'available')?.amount ?? 0n).toBe(
    available,
  );
  expect(rows.find((row) => row.kind === 'held')?.amount ?? 0n).toBe(held);
}
beforeAll(() => {
  const url = process.env.LEDGER_TEST_DATABASE_URL;
  if (
    process.env.NODE_ENV !== 'test' ||
    !url ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname)
  )
    throw new Error('Isolated ledger test database required.');
  ledger = new LedgerService(url);
});
afterAll(async () => {
  await ledger?.close();
});
it('opens an empty wallet once under concurrent requests without creating journal entries', async () => {
  const first = await wallet();
  const results = await Promise.all(
    Array.from({ length: 10 }, () => ledger.openWallet(first.userId)),
  );
  expect(new Set(results.map((result) => result.id))).toEqual(
    new Set([first.id]),
  );
  expect(
    await ledger.db.ledgerAccount.count({ where: { walletId: first.id } }),
  ).toBe(2);
  expect(
    await ledger.db.ledgerTransaction.count({ where: { walletId: first.id } }),
  ).toBe(0);
  await balances(first.id, 0n, 0n);
});
it('topups, reserves, raises, releases and captures with exact ledger-derived balances', async () => {
  const w = await funded();
  const holdId = randomUUID();
  await ledger.hold({ ...command(w.id), holdId, amountKobo: 40000n });
  await balances(w.id, 60000n, 40000n);
  const raise = await ledger.hold({
    ...command(w.id),
    holdId,
    amountKobo: 60000n,
  });
  expect(raise.amountKobo).toBe(20000n);
  await balances(w.id, 40000n, 60000n);
  const captured = await ledger.captureHold({
    ...command(w.id),
    holdId,
    amountKobo: 45000n,
  });
  expect(captured.operation).toBe('capture');
  await balances(w.id, 55000n, 0n);
  const second = randomUUID();
  await ledger.hold({ ...command(w.id), holdId: second, amountKobo: 10000n });
  await ledger.releaseHold({ ...command(w.id), holdId: second });
  await balances(w.id, 55000n, 0n);
});
it('charges an entire reservation without creating a zero-valued posting', async () => {
  const w = await funded();
  const holdId = randomUUID();
  await ledger.hold({ ...command(w.id), holdId, amountKobo: 100000n });
  await ledger.captureHold({ ...command(w.id), holdId, amountKobo: 100000n });
  await balances(w.id, 0n, 0n);
  expect(await ledger.db.ledgerEntry.count({ where: { amountKobo: 0n } })).toBe(
    0,
  );
});
it('supports debits, capped partial refunds and ledger-only payouts', async () => {
  const w = await funded();
  const debit = await ledger.debit({ ...command(w.id), amountKobo: 40000n });
  await ledger.refund({
    ...command(w.id),
    sourceTransactionId: debit.id,
    amountKobo: 15000n,
  });
  await ledger.refund({
    ...command(w.id),
    sourceTransactionId: debit.id,
    amountKobo: 25000n,
  });
  await expect(
    ledger.refund({
      ...command(w.id),
      sourceTransactionId: debit.id,
      amountKobo: 1n,
    }),
  ).rejects.toBeInstanceOf(InvalidRefundError);
  await ledger.payout({ ...command(w.id), amountKobo: 30000n });
  await balances(w.id, 70000n, 0n);
});
it('refunds captured charges and rejects refunds against topups, payouts or other wallets', async () => {
  const w = await funded();
  const other = await funded();
  const holdId = randomUUID();
  await ledger.hold({ ...command(w.id), holdId, amountKobo: 20000n });
  const debit = await ledger.captureHold({
    ...command(w.id),
    holdId,
    amountKobo: 10000n,
  });
  await ledger.refund({
    ...command(w.id),
    sourceTransactionId: debit.id,
    amountKobo: 10000n,
  });
  await expect(
    ledger.refund({
      ...command(other.id),
      sourceTransactionId: debit.id,
      amountKobo: 100n,
    }),
  ).rejects.toBeInstanceOf(InvalidRefundError);
  const topup = await ledger.topup({ ...command(w.id), amountKobo: 1n });
  const payout = await ledger.payout({ ...command(w.id), amountKobo: 1n });
  for (const sourceTransactionId of [topup.id, payout.id, randomUUID()])
    await expect(
      ledger.refund({ ...command(w.id), sourceTransactionId, amountKobo: 1n }),
    ).rejects.toBeInstanceOf(InvalidRefundError);
});
it('rejects spending held funds, oversized captures, foreign holds and terminal transitions', async () => {
  const w = await funded();
  const other = await funded();
  const holdId = randomUUID();
  await ledger.hold({ ...command(w.id), holdId, amountKobo: 90000n });
  for (const method of ['debit', 'payout'] as const)
    await expect(
      ledger[method]({ ...command(w.id), amountKobo: 10001n }),
    ).rejects.toBeInstanceOf(InsufficientFundsError);
  await expect(
    ledger.hold({ ...command(w.id), holdId: randomUUID(), amountKobo: 10001n }),
  ).rejects.toBeInstanceOf(InsufficientFundsError);
  await expect(
    ledger.hold({ ...command(w.id), holdId, amountKobo: 100001n }),
  ).rejects.toBeInstanceOf(InsufficientFundsError);
  await expect(
    ledger.captureHold({ ...command(w.id), holdId, amountKobo: 90001n }),
  ).rejects.toBeInstanceOf(InvalidHoldError);
  await expect(
    ledger.releaseHold({ ...command(other.id), holdId }),
  ).rejects.toBeInstanceOf(InvalidHoldError);
  await expect(
    ledger.hold({ ...command(w.id), holdId, amountKobo: 80000n }),
  ).rejects.toBeInstanceOf(InvalidHoldError);
  await ledger.releaseHold({ ...command(w.id), holdId });
  await expect(
    ledger.releaseHold({ ...command(w.id), holdId }),
  ).rejects.toBeInstanceOf(InvalidHoldError);
  for (const method of ['captureHold', 'hold'] as const)
    await expect(
      ledger[method]({ ...command(w.id), holdId, amountKobo: 90000n }),
    ).rejects.toBeInstanceOf(InvalidHoldError);
  await balances(w.id, 100000n, 0n);
});
it('replays every operation without posting twice, including replay after settlement', async () => {
  const w = await wallet();
  const holdId = randomUUID();
  const otherHold = randomUUID();
  const topup = { ...command(w.id), amountKobo: 100000n };
  const hold = { ...command(w.id), holdId, amountKobo: 40000n };
  const raised = { ...command(w.id), holdId, amountKobo: 50000n };
  const capture = { ...command(w.id), holdId, amountKobo: 30000n };
  const releaseHold = { ...command(w.id), holdId: otherHold };
  const debit = { ...command(w.id), amountKobo: 5000n };
  const payout = { ...command(w.id), amountKobo: 5000n };
  for (const call of [
    () => ledger.topup(topup),
    () => ledger.hold(hold),
    () => ledger.hold(raised),
    () => ledger.captureHold(capture),
  ]) {
    const first = await call();
    expect(await call()).toEqual(first);
  }
  await ledger.hold({ ...command(w.id), holdId: otherHold, amountKobo: 1000n });
  expect(await ledger.releaseHold(releaseHold)).toEqual(
    await ledger.releaseHold(releaseHold),
  );
  const charge = await ledger.debit(debit);
  expect(await ledger.debit(debit)).toEqual(charge);
  const refund = {
    ...command(w.id),
    sourceTransactionId: charge.id,
    amountKobo: 1000n,
  };
  expect(await ledger.refund(refund)).toEqual(await ledger.refund(refund));
  expect(await ledger.payout(payout)).toEqual(await ledger.payout(payout));
  expect(await ledger.hold(hold)).toMatchObject({
    operation: 'hold',
    amountKobo: 40000n,
  });
  await balances(w.id, 61000n, 0n);
});
it('rejects changed amounts, operations or owners under the same key and duplicate references', async () => {
  const w = await wallet();
  const other = await wallet();
  const input = { ...command(w.id), amountKobo: 10000n };
  await ledger.topup(input);
  for (const changed of [
    { ...input, amountKobo: 20000n },
    { ...input, walletId: other.id },
    { ...input, reference: randomUUID() },
  ])
    await expect(ledger.topup(changed)).rejects.toBeInstanceOf(
      LedgerConflictError,
    );
  await expect(ledger.debit(input)).rejects.toBeInstanceOf(LedgerConflictError);
  await expect(
    ledger.topup({ ...input, idempotencyKey: randomUUID() }),
  ).rejects.toBeInstanceOf(LedgerConflictError);
  await balances(w.id, 10000n, 0n);
  await balances(other.id, 0n, 0n);
});
it('rejects zero, negative, non-bigint and unsafe amounts without changing the wallet', async () => {
  const w = await wallet();
  for (const amountKobo of [0n, -1n, 9007199254740992n, 1.2, 100, NaN])
    await expect(
      ledger.topup({ ...command(w.id), amountKobo: amountKobo as bigint }),
    ).rejects.toThrow();
  await balances(w.id, 0n, 0n);
  await ledger.topup({ ...command(w.id), amountKobo: 9007199254740991n });
  await expect(
    ledger.topup({ ...command(w.id), amountKobo: 1n }),
  ).rejects.toThrow();
  await balances(w.id, 9007199254740991n, 0n);
});
it('never double-spends with 50 simultaneous holds using independent service instances', async () => {
  const w = await funded(10000n);
  const second = new LedgerService(process.env.LEDGER_TEST_DATABASE_URL);
  try {
    const outcomes = await Promise.allSettled(
      Array.from({ length: 50 }, (_, index) =>
        (index % 2 === 0 ? ledger : second).hold({
          ...command(w.id),
          holdId: randomUUID(),
          amountKobo: 1000n,
        }),
      ),
    );
    expect(
      outcomes.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(10);
    for (const result of outcomes)
      if (result.status === 'rejected')
        expect(result.reason).toBeInstanceOf(InsufficientFundsError);
    await balances(w.id, 0n, 10000n);
    expect(
      await ledger.db.walletHold.count({
        where: { walletId: w.id, status: 'active' },
      }),
    ).toBe(10);
  } finally {
    await second.close();
  }
}, 60000);
it('serializes 50 retries of the same request into one journal', async () => {
  const w = await wallet();
  const input = { ...command(w.id), amountKobo: 10000n };
  const receipts = await Promise.all(
    Array.from({ length: 50 }, () => ledger.topup(input)),
  );
  expect(new Set(receipts.map((result) => result.id)).size).toBe(1);
  expect(
    await ledger.db.ledgerTransaction.count({ where: { walletId: w.id } }),
  ).toBe(1);
  await balances(w.id, 10000n, 0n);
}, 60000);
it('settles a hold once under a capture/release race and preserves all money', async () => {
  const w = await funded();
  const holdId = randomUUID();
  await ledger.hold({ ...command(w.id), holdId, amountKobo: 60000n });
  const outcomes = await Promise.allSettled([
    ledger.captureHold({ ...command(w.id), holdId, amountKobo: 45000n }),
    ledger.releaseHold({ ...command(w.id), holdId }),
  ]);
  expect(
    outcomes.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1);
  const settled = await ledger.db.walletHold.findUniqueOrThrow({
    where: { id: holdId },
  });
  await balances(w.id, settled.status === 'captured' ? 55000n : 100000n, 0n);
});
it('caps concurrent refunds at the original debit', async () => {
  const w = await funded();
  const charge = await ledger.debit({ ...command(w.id), amountKobo: 10000n });
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, () =>
      ledger.refund({
        ...command(w.id),
        sourceTransactionId: charge.id,
        amountKobo: 1000n,
      }),
    ),
  );
  expect(
    results.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(10);
  await balances(w.id, 100000n, 0n);
}, 60000);
it('returns cursor-paginated history without mixing wallets or duplicating boundary rows', async () => {
  const w = await funded();
  const other = await funded();
  for (let index = 0; index < 5; index++)
    await ledger.debit({ ...command(w.id), amountKobo: 1n });
  const first = await ledger.history(w.userId, { limit: 3 });
  expect(first.items).toHaveLength(3);
  expect(first.nextCursor).toBeTruthy();
  if (!first.nextCursor) throw new Error('Expected next cursor.');
  const next = await ledger.history(w.userId, {
    limit: 3,
    cursor: first.nextCursor,
  });
  expect(next.items).toHaveLength(3);
  expect(next.nextCursor).toBeNull();
  expect(
    new Set([...first.items, ...next.items].map((item) => item.id)).size,
  ).toBe(6);
  expect(
    (await ledger.history(other.userId, { limit: 50 })).items,
  ).toHaveLength(1);
  await expect(ledger.history(w.userId, { limit: 51 })).rejects.toThrow();
  await expect(
    ledger.history(w.userId, { limit: 3, cursor: 'not-a-valid-cursor' }),
  ).rejects.toThrow();
});
it('rolls back postings and preserves the idempotency key when a credit exceeds the safe balance', async () => {
  const w = await funded(BigInt(Number.MAX_SAFE_INTEGER));
  const input = { ...command(w.id), amountKobo: 1n };
  await expect(ledger.topup(input)).rejects.toThrow();
  expect(
    await ledger.db.ledgerTransaction.count({
      where: { idempotencyKey: input.idempotencyKey },
    }),
  ).toBe(0);
  await balances(w.id, BigInt(Number.MAX_SAFE_INTEGER), 0n);
  await ledger.debit({ ...command(w.id), amountKobo: 1n });
  await ledger.topup(input);
  await balances(w.id, BigInt(Number.MAX_SAFE_INTEGER), 0n);
});
it('database guards reject overdrafts, orphan reservations and mismatched journal metadata atomically', async () => {
  const w = await wallet();
  const url = process.env.LEDGER_TEST_DATABASE_URL;
  if (!url) throw new Error('Missing isolated database.');
  await exerciseWalletConstraints(url, w.id);
  expect(
    await ledger.db.ledgerTransaction.count({ where: { walletId: w.id } }),
  ).toBe(0);
  expect(await ledger.db.walletHold.count({ where: { walletId: w.id } })).toBe(
    0,
  );
  await balances(w.id, 0n, 0n);
});
it('every service journal balances and each wallet ledger reconciles with active holds', async () => {
  const journals = await ledger.db.$queryRaw<
    { id: string; net: bigint }[]
  >`SELECT t.id,SUM(CASE WHEN e.side='debit' THEN e.amount_kobo ELSE -e.amount_kobo END)::bigint AS net FROM ledger_transactions t JOIN ledger_entries e ON e.transaction_id=t.id WHERE t.wallet_id IS NOT NULL GROUP BY t.id`;
  expect(journals.length).toBeGreaterThan(10);
  for (const journal of journals) expect(journal.net).toBe(0n);
  const wallets = await ledger.db.wallet.findMany();
  for (const w of wallets) {
    const balance = await ledger.balances(w.id);
    const active = await ledger.db.walletHold.aggregate({
      where: { walletId: w.id, status: 'active' },
      _sum: { amountKobo: true },
    });
    expect(balance.heldKobo).toBe(active._sum.amountKobo ?? 0n);
    expect(balance.availableKobo).toBeGreaterThanOrEqual(0n);
  }
});
