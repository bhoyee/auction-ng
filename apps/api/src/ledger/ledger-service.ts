import { createHash, randomUUID } from 'node:crypto';
import {
  ledgerCommandSchema,
  walletBalanceSchema,
  walletHistoryInputSchema,
  walletHistorySchema,
  walletCursorSchema,
  databaseValues,
  fromLedgerKobo,
  type LedgerAmountInput,
  type LedgerHoldInput,
  type LedgerReleaseInput,
  type LedgerRefundInput,
  type LedgerCommand,
  type WalletHistoryInput,
} from '@auction-ng/shared';
import { createDatabase } from '../database/client';
import type { Prisma, LedgerTransaction } from '../generated/prisma/client';
import {
  InsufficientFundsError,
  LedgerConflictError,
  InvalidHoldError,
  InvalidRefundError,
  WalletNotFoundError,
  LedgerInvariantError,
  InvalidLedgerInputError,
} from './ledger-errors';

type Tx = Prisma.TransactionClient;
type Operation = (typeof databaseValues.walletOperations)[number];
type Posting = {
  accountId: string;
  amountKobo: bigint;
  side: 'credit' | 'debit';
};
export type LedgerReceipt = {
  id: string;
  walletId: string;
  operation: Operation;
  amountKobo: bigint;
  availableDeltaKobo: bigint;
  heldDeltaKobo: bigint;
  holdId: string | null;
  sourceTransactionId: string | null;
  createdAt: Date;
};
const MAX = BigInt(Number.MAX_SAFE_INTEGER);
const SYSTEM = {
  topup: 'system:payments-clearing',
  sale: 'system:sales-settlement',
  payout: 'system:payout-clearing',
} as const;

export class LedgerService {
  readonly db: ReturnType<typeof createDatabase>;
  constructor(databaseUrl: string | undefined = process.env.DATABASE_URL) {
    this.db = createDatabase(databaseUrl);
  }
  async close() {
    await this.db.$disconnect();
  }
  async onModuleDestroy() {
    await this.close();
  }
  private async accounts(tx: Tx, walletId: string) {
    await tx.ledgerAccount.createMany({
      data: [
        { code: `wallet:${walletId}:available`, walletId, kind: 'available' },
        { code: `wallet:${walletId}:held`, walletId, kind: 'held' },
        ...Object.values(SYSTEM).map((code) => ({ code, kind: 'system' })),
      ],
      skipDuplicates: true,
    });
    const rows = await tx.ledgerAccount.findMany({
      where: { OR: [{ walletId }, { code: { in: Object.values(SYSTEM) } }] },
    });
    const account = (code: string) => {
      const row = rows.find((value) => value.code === code);
      if (!row || row.currency !== 'NGN')
        throw new LedgerInvariantError('Ledger account is unavailable.');
      return row.id;
    };
    return {
      available: account(`wallet:${walletId}:available`),
      held: account(`wallet:${walletId}:held`),
      topup: account(SYSTEM.topup),
      sale: account(SYSTEM.sale),
      payout: account(SYSTEM.payout),
    };
  }
  private async readBalances(
    tx: Tx | ReturnType<typeof createDatabase>,
    walletId: string,
  ) {
    const rows = await tx.$queryRaw<
      { available: bigint; held: bigint; reserved: bigint }[]
    >`SELECT COALESCE(SUM(CASE WHEN a.kind='available' THEN CASE WHEN e.side='credit' THEN e.amount_kobo ELSE -e.amount_kobo END ELSE 0 END),0)::bigint AS available, COALESCE(SUM(CASE WHEN a.kind='held' THEN CASE WHEN e.side='credit' THEN e.amount_kobo ELSE -e.amount_kobo END ELSE 0 END),0)::bigint AS held,(SELECT COALESCE(SUM(amount_kobo),0)::bigint FROM wallet_holds WHERE wallet_id=${walletId}::uuid AND status='active') AS reserved FROM ledger_accounts a LEFT JOIN ledger_entries e ON e.account_id=a.id WHERE a.wallet_id=${walletId}::uuid`;
    const row = rows[0];
    if (
      !row ||
      row.available < 0n ||
      row.held < 0n ||
      row.available + row.held > MAX ||
      row.held !== row.reserved
    )
      throw new LedgerInvariantError('Wallet balances do not reconcile.');
    return { availableKobo: row.available, heldKobo: row.held };
  }
  async balances(walletId: string) {
    if (!(await this.db.wallet.findUnique({ where: { id: walletId } })))
      throw new WalletNotFoundError('Wallet not found.');
    return this.readBalances(this.db, walletId);
  }
  async lockedBalances(tx: Tx, walletId: string) {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM wallets WHERE id=${walletId}::uuid FOR UPDATE`;
    if (rows.length !== 1) throw new WalletNotFoundError('Wallet not found.');
    return this.readBalances(tx, walletId);
  }
  private dto(
    wallet: { id: string; userId: string; currency: string },
    balance: { availableKobo: bigint; heldKobo: bigint },
  ) {
    return walletBalanceSchema.parse({
      id: wallet.id,
      userId: wallet.userId,
      currency: wallet.currency,
      availableKobo: fromLedgerKobo(balance.availableKobo),
      heldKobo: fromLedgerKobo(balance.heldKobo),
      totalKobo: fromLedgerKobo(balance.availableKobo + balance.heldKobo),
    });
  }
  async openWallet(userId: string) {
    if (!walletCursorSchema.shape.id.safeParse(userId).success)
      throw new InvalidLedgerInputError('Invalid user.');
    return this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId},510))`;
        const wallet = await tx.wallet.upsert({
          where: { userId },
          create: { userId },
          update: {},
        });
        await tx.$queryRaw`SELECT id FROM wallets WHERE id=${wallet.id}::uuid FOR UPDATE`;
        await this.accounts(tx, wallet.id);
        return this.dto(wallet, await this.readBalances(tx, wallet.id));
      },
      { maxWait: 60000, timeout: 15000 },
    );
  }
  async getWallet(userId: string) {
    const wallet = await this.db.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new WalletNotFoundError('Open your wallet first.');
    return this.dto(wallet, await this.readBalances(this.db, wallet.id));
  }
  async receiptForKey(idempotencyKey: string) {
    const row = await this.db.ledgerTransaction.findUnique({
      where: { idempotencyKey },
    });
    return row ? this.receipt(row) : null;
  }
  private receipt(row: LedgerTransaction): LedgerReceipt {
    const {
      walletId,
      operation,
      amountKobo,
      availableDeltaKobo,
      heldDeltaKobo,
    } = row;
    if (
      walletId === null ||
      operation === null ||
      amountKobo === null ||
      availableDeltaKobo === null ||
      heldDeltaKobo === null
    )
      throw new LedgerInvariantError('Wallet journal metadata is missing.');
    const parsed =
      walletHistorySchema.shape.items.element.shape.operation.safeParse(
        operation,
      );
    if (!parsed.success)
      throw new LedgerInvariantError('Invalid wallet operation.');
    return {
      id: row.id,
      walletId,
      operation: parsed.data,
      amountKobo,
      availableDeltaKobo,
      heldDeltaKobo,
      holdId: row.holdId,
      sourceTransactionId: row.sourceTransactionId,
      createdAt: row.createdAt,
    };
  }
  topup(input: LedgerAmountInput) {
    return this.execute({ ...input, operation: 'topup' });
  }
  hold(input: LedgerHoldInput) {
    return this.execute({ ...input, operation: 'hold' });
  }
  releaseHold(input: LedgerReleaseInput) {
    return this.execute({ ...input, operation: 'release' });
  }
  captureHold(input: LedgerHoldInput) {
    return this.execute({ ...input, operation: 'capture' });
  }
  debit(input: LedgerAmountInput) {
    return this.execute({ ...input, operation: 'debit' });
  }
  refund(input: LedgerRefundInput) {
    return this.execute({ ...input, operation: 'refund' });
  }
  payout(input: LedgerAmountInput) {
    return this.execute({ ...input, operation: 'payout' });
  }

  private async execute(input: LedgerCommand): Promise<LedgerReceipt> {
    const parsed = ledgerCommandSchema.safeParse(input);
    if (!parsed.success)
      throw new InvalidLedgerInputError('Invalid ledger command.');
    const command = parsed.data;
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify(command, (_key, value: unknown) =>
          typeof value === 'bigint' ? value.toString() : value,
        ),
      )
      .digest('hex');
    try {
      return await this.db.$transaction(
        async (tx) => {
          // Every writer uses the same lock order: request key, reference, wallet.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${command.idempotencyKey},511))`;
          const previous = await tx.ledgerTransaction.findUnique({
            where: { idempotencyKey: command.idempotencyKey },
          });
          if (previous) {
            if (previous.requestHash !== requestHash)
              throw new LedgerConflictError(
                'The idempotency key has already been used for another request.',
              );
            return this.receipt(previous);
          }
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${command.reference},512))`;
          if (
            await tx.ledgerTransaction.findUnique({
              where: { reference: command.reference },
            })
          )
            throw new LedgerConflictError(
              'The reference has already been recorded.',
            );
          const locked = await tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM wallets WHERE id=${command.walletId}::uuid FOR UPDATE`;
          if (locked.length !== 1)
            throw new WalletNotFoundError('Wallet not found.');
          const account = await this.accounts(tx, command.walletId);
          const before = await this.readBalances(tx, command.walletId);
          const postings: Posting[] = [];
          const move = (from: string, to: string, amountKobo: bigint) => {
            if (amountKobo === 0n) return;
            postings.push(
              { accountId: from, amountKobo, side: 'debit' },
              { accountId: to, amountKobo, side: 'credit' },
            );
          };
          const requireAvailable = (amount: bigint) => {
            if (before.availableKobo < amount)
              throw new InsufficientFundsError(
                'Available wallet balance is too low.',
              );
          };
          let amountKobo = 'amountKobo' in command ? command.amountKobo : 0n;
          let availableDeltaKobo = 0n;
          let heldDeltaKobo = 0n;
          if (command.operation === 'hold') {
            const hold = await tx.walletHold.findUnique({
              where: { id: command.holdId },
            });
            if (
              hold &&
              (hold.walletId !== command.walletId ||
                hold.status !== 'active' ||
                hold.amountKobo >= command.amountKobo)
            )
              throw new InvalidHoldError('The reservation cannot be raised.');
            amountKobo = command.amountKobo - (hold?.amountKobo ?? 0n);
            requireAvailable(amountKobo);
            if (hold)
              await tx.walletHold.update({
                where: { id: hold.id },
                data: { amountKobo: command.amountKobo },
              });
            else
              await tx.walletHold.create({
                data: {
                  id: command.holdId,
                  walletId: command.walletId,
                  amountKobo: command.amountKobo,
                },
              });
            move(account.available, account.held, amountKobo);
            availableDeltaKobo = -amountKobo;
            heldDeltaKobo = amountKobo;
          } else if (
            command.operation === 'release' ||
            command.operation === 'capture'
          ) {
            const hold = await tx.walletHold.findUnique({
              where: { id: command.holdId },
            });
            if (
              !hold ||
              hold.walletId !== command.walletId ||
              hold.status !== 'active'
            )
              throw new InvalidHoldError(
                'The reservation is not active for this wallet.',
              );
            if (
              command.operation === 'capture' &&
              command.amountKobo > hold.amountKobo
            )
              throw new InvalidHoldError('The charge exceeds the reservation.');
            await tx.walletHold.update({
              where: { id: hold.id },
              data: {
                status:
                  command.operation === 'capture' ? 'captured' : 'released',
              },
            });
            heldDeltaKobo = -hold.amountKobo;
            if (command.operation === 'release') {
              amountKobo = hold.amountKobo;
              availableDeltaKobo = amountKobo;
              move(account.held, account.available, amountKobo);
            } else {
              availableDeltaKobo = hold.amountKobo - command.amountKobo;
              move(account.held, account.sale, command.amountKobo);
              move(account.held, account.available, availableDeltaKobo);
            }
          } else if (command.operation === 'refund') {
            const source = await tx.ledgerTransaction.findUnique({
              where: { id: command.sourceTransactionId },
            });
            if (
              !source ||
              source.walletId !== command.walletId ||
              !['debit', 'capture'].includes(source.operation ?? '') ||
              source.amountKobo === null
            )
              throw new InvalidRefundError(
                'Refund must reference an original wallet charge.',
              );
            const refunded = await tx.ledgerTransaction.aggregate({
              where: {
                walletId: command.walletId,
                sourceTransactionId: source.id,
                operation: 'refund',
              },
              _sum: { amountKobo: true },
            });
            if (
              (refunded._sum.amountKobo ?? 0n) + command.amountKobo >
              source.amountKobo
            )
              throw new InvalidRefundError(
                'Refund exceeds the unrefunded charge.',
              );
            availableDeltaKobo = command.amountKobo;
            move(account.sale, account.available, command.amountKobo);
          } else if (command.operation === 'topup') {
            availableDeltaKobo = command.amountKobo;
            move(account.topup, account.available, command.amountKobo);
          } else {
            requireAvailable(command.amountKobo);
            availableDeltaKobo = -command.amountKobo;
            move(
              account.available,
              command.operation === 'payout' ? account.payout : account.sale,
              command.amountKobo,
            );
          }
          const row = await tx.ledgerTransaction.create({
            data: {
              id: randomUUID(),
              idempotencyKey: command.idempotencyKey,
              reference: command.reference,
              type:
                command.operation === 'capture' ? 'debit' : command.operation,
              operation: command.operation,
              walletId: command.walletId,
              amountKobo,
              availableDeltaKobo,
              heldDeltaKobo,
              requestHash,
              holdId: 'holdId' in command ? command.holdId : null,
              sourceTransactionId:
                'sourceTransactionId' in command
                  ? command.sourceTransactionId
                  : null,
            },
          });
          await tx.ledgerEntry.createMany({
            data: postings.map((posting, index) => ({
              ...posting,
              transactionId: row.id,
              idempotencyKey: `${command.idempotencyKey}:${index}`,
            })),
          });
          const after = await this.readBalances(tx, command.walletId);
          if (
            after.availableKobo !== before.availableKobo + availableDeltaKobo ||
            after.heldKobo !== before.heldKobo + heldDeltaKobo
          )
            throw new LedgerInvariantError(
              'Journal deltas do not match wallet balances.',
            );
          return this.receipt(row);
        },
        { maxWait: 60000, timeout: 15000 },
      );
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      )
        throw new LedgerConflictError(
          'The request conflicts with an existing ledger record.',
        );
      throw error;
    }
  }
  async history(userId: string, input: WalletHistoryInput) {
    const parsed = walletHistoryInputSchema.safeParse(input);
    if (!parsed.success)
      throw new InvalidLedgerInputError('Invalid history query.');
    const { limit, cursor } = parsed.data;
    let boundary: { id: string; createdAt: string } | undefined;
    if (cursor) {
      try {
        boundary = walletCursorSchema.parse(
          JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
        );
      } catch {
        throw new InvalidLedgerInputError('Invalid history cursor.');
      }
    }
    const wallet = await this.db.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new WalletNotFoundError('Open your wallet first.');
    const rows = await this.db.ledgerTransaction.findMany({
      where: {
        walletId: wallet.id,
        ...(boundary
          ? {
              OR: [
                { createdAt: { lt: new Date(boundary.createdAt) } },
                {
                  createdAt: new Date(boundary.createdAt),
                  id: { lt: boundary.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);
    const delta = (value: bigint) => {
      if (value < -MAX || value > MAX)
        throw new LedgerInvariantError('Unsafe ledger delta.');
      return Number(value);
    };
    return walletHistorySchema.parse({
      items: visible.map((row) => {
        const receipt = this.receipt(row);
        return {
          id: receipt.id,
          operation: receipt.operation,
          amountKobo: fromLedgerKobo(receipt.amountKobo),
          availableDeltaKobo: delta(receipt.availableDeltaKobo),
          heldDeltaKobo: delta(receipt.heldDeltaKobo),
          holdId: receipt.holdId,
          sourceTransactionId: receipt.sourceTransactionId,
          createdAt: receipt.createdAt.toISOString(),
        };
      }),
      nextCursor:
        rows.length > limit && last
          ? Buffer.from(
              JSON.stringify({
                id: last.id,
                createdAt: last.createdAt.toISOString(),
              }),
            ).toString('base64url')
          : null,
    });
  }
}
