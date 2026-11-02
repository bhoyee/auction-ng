import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { createClient } from 'redis';
import type { Prisma } from '../generated/prisma/client';
import { LedgerService } from '../ledger/ledger-service';
import { decryptPii, encryptPii } from '../security/pii';
import { persistAcceptedBids } from './bid-persistence';

const digest = (value: unknown) =>
  createHash('sha256')
    .update(
      JSON.stringify(value, (_, item: unknown) =>
        typeof item === 'bigint' ? item.toString() : item,
      ),
    )
    .digest('hex');
const commandSchema = z
  .object({
    idempotencyKey: z.uuid(),
    reportFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    operator: z.string().trim().min(3).max(100),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();
const reportSchema = z
  .object({
    namespace: z.string(),
    database: z.string(),
    previousRunId: z.string(),
    nextRunId: z.string(),
    acceptedCount: z.number().int().nonnegative(),
    activeHoldCount: z.number().int().nonnegative(),
    databaseChecksum: z.string(),
    redisChecksum: z.string(),
    fingerprint: z.string(),
  })
  .strict();
type Report = z.infer<typeof reportSchema>;
type Tx = Prisma.TransactionClient;
export class RecoveryConflictError extends Error {}
function conflict(message: string): never {
  throw new RecoveryConflictError(message);
}

// Deliberately offline, operator-driven recovery. This module never writes ledger data.
// Reuse the receipt validator in a READ ONLY transaction: missing receipts cannot be created.
export class BidRuntimeRecovery {
  private readonly scope: string;
  private readonly gate: string;
  constructor(
    private readonly ledger: LedgerService,
    private readonly redis: ReturnType<typeof createClient>,
    private readonly prefix: string,
    private readonly options: {
      assertOffline: () => Promise<void>;
      afterMarkerCommitted?: () => Promise<void>;
      afterDatabaseCommitted?: () => Promise<void>;
    },
  ) {
    if (!/^[a-zA-Z0-9:_-]{1,160}$/.test(prefix))
      conflict('Invalid recovery namespace.');
    this.scope = 'bid-recovery:' + digest(prefix).slice(0, 32);
    this.gate = prefix + 'recovery';
  }
  private async runId() {
    const config = await this.redis.configGet([
      'appendonly',
      'appendfsync',
      'maxmemory-policy',
      'no-appendfsync-on-rewrite',
    ]);
    if (
      config.appendonly !== 'yes' ||
      config.appendfsync !== 'always' ||
      config['maxmemory-policy'] !== 'noeviction' ||
      config['no-appendfsync-on-rewrite'] !== 'no'
    )
      conflict('Durable Redis settings are required for recovery.');
    const persistence = await this.redis.info('persistence');
    if (
      !/^aof_enabled:1\r?$/m.test(persistence) ||
      !/^aof_last_write_status:ok\r?$/m.test(persistence) ||
      !/^loading:0\r?$/m.test(persistence)
    )
      conflict('Redis durable storage is not ready for recovery.');
    const id = /^run_id:(\w+)/m.exec(await this.redis.info('server'))?.[1];
    if (!id) return conflict('Redis process identity is unavailable.');
    return id;
  }
  private async stored(key: string) {
    const row = await this.ledger.db.idempotencyKey.findUnique({
      where: { scope_key: { scope: this.scope, key } },
    });
    return row;
  }
  private envelope(bytes: Uint8Array | null, key: string): Report {
    if (!bytes) return conflict('Recovery receipt is incomplete.');
    return reportSchema.parse(
      JSON.parse(decryptPii(Buffer.from(bytes), this.scope + ':' + key)),
    );
  }
  private async lock(tx: Tx) {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${this.prefix},0))`;
  }
  async audit(reference?: Report, owner?: string): Promise<Report> {
    try {
      return await this.ledger.db.$transaction(
        async (tx) => {
          await tx.$executeRaw`SET TRANSACTION READ ONLY`;
          const database = (
            await tx.$queryRaw<
              { name: string }[]
            >`SELECT current_database() AS name`
          )[0]?.name;
          if (!database) return conflict('Database identity is unavailable.');
          const runtime = await tx.bidEngineRuntime.findUnique({
            where: { namespace: this.prefix },
          });
          if (!runtime)
            return conflict('An existing durable bid runtime is required.');
          const nextRunId = await this.runId();
          const previousRunId = reference?.previousRunId ?? runtime.redisRunId;
          if (
            reference &&
            (reference.database !== database ||
              reference.namespace !== this.prefix ||
              reference.nextRunId !== nextRunId ||
              runtime.redisRunId !== previousRunId)
          )
            conflict(
              'The recovery identities have changed. Keep services paused.',
            );
          const gate = await this.redis.get(this.gate);
          if (gate && gate !== owner)
            conflict('A recovery is pending. Resume its original operation.');
          const marker = await this.redis.get(this.prefix + 'runtime');
          const oldMarker = digest([database, this.prefix, previousRunId]);
          const nextMarker = digest([database, this.prefix, nextRunId]);
          if (
            marker !== oldMarker &&
            !(reference && gate === owner && marker === nextMarker)
          )
            conflict(
              'Preserved runtime marker does not match its durable owner.',
            );
          const keys: string[] = [];
          for await (const page of this.redis.scanIterator({
            MATCH: this.prefix + '*',
            COUNT: 500,
          })) {
            for (const key of page) {
              const suffix = key.slice(this.prefix.length);
              if (
                suffix === 'runtime' ||
                suffix === 'recovery' ||
                suffix.startsWith('rate:') ||
                suffix.startsWith('public-connections:')
              )
                continue;
              if (suffix.startsWith('cancellation:'))
                conflict(
                  'An unfinished cancellation barrier needs separate review.',
                );
              keys.push(key);
              if (keys.length > 10000)
                conflict(
                  'This namespace exceeds the bounded offline recovery limit.',
                );
            }
          }
          keys.sort();
          const state = new Map<string, unknown>();
          const strings = new Map<string, string>();
          for (const key of keys) {
            const kind = await this.redis.type(key);
            if (kind === 'string') {
              const raw = await this.redis.get(key);
              if (raw === null)
                conflict('Preserved bid state changed during inspection.');
              strings.set(key, raw);
              state.set(key, raw);
            } else if (kind === 'hash')
              state.set(
                key,
                Object.entries(await this.redis.hGetAll(key)).sort(([a], [b]) =>
                  a.localeCompare(b),
                ),
              );
            else if (kind === 'stream') {
              if (key !== this.prefix + 'accepted')
                conflict('An unknown stream needs separate review.');
              const entries = await this.redis.xRange(key, '-', '+', {
                COUNT: 10001,
              });
              if (entries.length > 10000)
                conflict(
                  'This stream exceeds the bounded offline recovery limit.',
                );
              state.set(key, entries);
            } else
              conflict(
                'Unknown or changing Redis state requires separate review.',
              );
          }
          const entries = await this.redis.xRange(
            this.prefix + 'accepted',
            '-',
            '+',
            { COUNT: 10001 },
          );
          if (
            entries.length > 10000 ||
            entries.some((entry) => entry.message.kind === 'cancellation')
          )
            conflict(
              'Large or cancellation-bearing streams need a dedicated review.',
            );
          const receipts = await tx.bidAcceptance.findMany({
            where: { namespace: this.prefix },
            orderBy: { streamId: 'asc' },
            take: 10001,
          });
          if (
            receipts.length !== entries.length ||
            receipts.some(
              (row) =>
                !entries.some(
                  (entry) =>
                    entry.id === row.streamId &&
                    entry.message.intentId === row.id,
                ),
            )
          )
            conflict(
              'Durable accepted receipts and preserved stream events differ.',
            );
          for (let index = 0; index < entries.length; index += 50) {
            await persistAcceptedBids(
              this.ledger,
              this.redis,
              this.prefix,
              entries.slice(index, index + 50).map((entry) => entry.id),
              tx,
            );
          }
          const intents = await tx.bidFundingIntent.findMany({
            where: { namespace: this.prefix },
            include: { hold: true },
            orderBy: { id: 'asc' },
            take: 10001,
          });
          if (
            intents.length > 10000 ||
            intents.some(
              (intent) => !['retained', 'released'].includes(intent.status),
            )
          )
            conflict(
              'Uncertain prepared funds need separate review before recovery.',
            );
          const settlements = await tx.lotSettlement.findMany({
            where: { namespace: this.prefix },
            orderBy: { lotId: 'asc' },
            take: 10001,
          });
          if (
            settlements.length > 10000 ||
            settlements.some(
              (row) => !['paid', 'unsold', 'defaulted'].includes(row.status),
            )
          )
            conflict('An unfinished settlement needs separate review.');
          const pendingPurchases = await tx.purchase.count({
            where: {
              namespace: this.prefix,
              OR: [
                { status: 'pending' },
                { status: 'paid', holdsReleasedAt: null },
              ],
            },
          });
          const pendingCancellations = await tx.bidCancellationApproval.count({
            where: { namespace: this.prefix, status: { not: 'completed' } },
          });
          const launching = await tx.lot.findMany({
            where: { preBidsLaunching: true },
            orderBy: { id: 'asc' },
            take: 10001,
          });
          const preBids = await tx.preBid.count({
            where: { status: { in: ['active', 'launching'] } },
          });
          if (pendingPurchases || pendingCancellations || preBids)
            conflict(
              'An in-flight purchase, cancellation or pre-bid needs separate review.',
            );
          if (launching.length > 10000)
            conflict('The launch set exceeds the bounded recovery limit.');
          // Empty launches can be left intact for the existing idempotent worker.
          // Any funded launch still requires separate recovery review.
          for (const lot of launching) {
            if (
              lot.status !== 'scheduled' ||
              lot.startAt.getTime() > Date.now() ||
              (await tx.preBid.count({ where: { lotId: lot.id } })) ||
              (await tx.bidFundingIntent.count({ where: { lotId: lot.id } })) ||
              (await tx.bid.count({ where: { lotId: lot.id } }))
            )
              conflict(
                'A nonempty or inconsistent launch needs separate review.',
              );
            const raw = strings.get(this.prefix + 'lot:' + lot.id);
            if (raw) {
              const state = z
                .object({
                  open: z.literal(true),
                  launching: z.literal(true),
                  leader: z.null(),
                  groupId: z.null(),
                  currentPriceKobo: z.null(),
                  startPriceKobo: z.number().int().safe(),
                  startsAt: z.number().int().safe(),
                  endsAt: z.number().int().safe(),
                })
                .passthrough()
                .parse(JSON.parse(raw));
              if (
                BigInt(state.startPriceKobo) !== lot.startPriceKobo ||
                state.startsAt !== lot.startAt.getTime() ||
                state.endsAt !== lot.endAt.getTime()
              )
                conflict('An empty launch differs from its durable schedule.');
            }
          }
          const purchases = await tx.purchase.findMany({
            where: { namespace: this.prefix, status: 'paid' },
            include: { invoice: { include: { lines: true } }, lot: true },
            orderBy: { id: 'asc' },
            take: 10001,
          });
          if (purchases.length > 10000)
            conflict('The purchase set exceeds the bounded recovery limit.');
          const soldLots = new Set<string>();
          const purchaseDebits = [];
          for (const [key, raw] of strings) {
            if (!key.startsWith(this.prefix + 'purchase:')) continue;
            const marker = z
              .object({
                id: z.uuid(),
                mode: z.literal('sold'),
                expiresAt: z.number().int().safe().positive(),
              })
              .strict()
              .parse(JSON.parse(raw));
            const purchase = purchases.find(
              (row) =>
                row.id === marker.id &&
                key === this.prefix + 'purchase:' + row.lotId,
            );
            if (
              !purchase ||
              !purchase.holdsReleasedAt ||
              purchase.lot.status !== 'closed'
            )
              conflict('A sold marker has no verified completed purchase.');
            const invoice = purchase.invoice;
            const line = invoice?.lines[0];
            if (
              !invoice ||
              invoice.status !== 'paid' ||
              invoice.currency !== 'NGN' ||
              invoice.userId !== purchase.userId ||
              invoice.totalKobo !== purchase.totalKobo ||
              invoice.hammerTotalKobo !== purchase.priceKobo ||
              invoice.vatKobo !== purchase.taxKobo ||
              invoice.premiumKobo !== 0n ||
              invoice.lotFeeKobo !== 0n ||
              invoice.lines.length !== 1 ||
              !line ||
              line.lotId !== purchase.lotId ||
              line.hammerKobo !== purchase.priceKobo ||
              line.totalKobo !== purchase.totalKobo ||
              line.vatKobo !== purchase.taxKobo ||
              line.premiumKobo !== 0n ||
              line.lotFeeKobo !== 0n
            )
              conflict('The paid purchase invoice is inconsistent.');
            const debit = await tx.ledgerTransaction.findUnique({
              where: { idempotencyKey: 'purchase:debit:' + purchase.id },
            });
            if (
              !debit ||
              debit.operation !== 'debit' ||
              debit.walletId !== purchase.walletId ||
              debit.amountKobo !== purchase.totalKobo ||
              debit.currency !== 'NGN'
            )
              conflict('The purchase debit receipt is inconsistent.');
            const lotRaw = strings.get(this.prefix + 'lot:' + purchase.lotId);
            if (
              !lotRaw ||
              JSON.parse(lotRaw).open !== false ||
              intents.some(
                (intent) =>
                  intent.lotId === purchase.lotId &&
                  intent.hold?.status === 'active',
              )
            )
              conflict(
                'A sold purchase still has an open lot or reserved funds.',
              );
            soldLots.add(purchase.lotId);
            purchaseDebits.push(debit);
          }
          if (purchases.some((purchase) => !soldLots.has(purchase.lotId)))
            conflict(
              'A completed purchase is missing its preserved sold marker.',
            );
          const groups = await this.redis.hGetAll(this.prefix + 'groups');
          const active = intents.filter(
            (intent) => intent.hold?.status === 'active',
          );
          const groupIds = new Set(active.map((intent) => intent.groupId));
          for (const intent of active)
            if (
              intent.status !== 'retained' ||
              !receipts.some((row) => row.id === intent.id) ||
              groups[intent.groupId] !== 'active'
            )
              conflict(
                'An active reservation is not backed by a retained accepted bid.',
              );
          for (const groupId of groupIds) {
            const funded = active.filter(
              (intent) => intent.groupId === groupId,
            );
            const first = funded[0];
            if (!first) return conflict('Reservation group is unavailable.');
            const raw = strings.get(this.prefix + 'lot:' + first.lotId);
            if (!raw) return conflict('A funded lot state is missing.');
            const lot = z
              .object({
                groupId: z.uuid(),
                heldKobo: z.number().int().safe().positive(),
                leader: z.object({
                  bidderId: z.uuid(),
                  maxKobo: z.number().int().safe().positive(),
                }),
                feeVersion: z.string(),
                launching: z.boolean().optional(),
              })
              .passthrough()
              .parse(JSON.parse(raw));
            const total = funded.reduce(
              (sum, intent) => sum + (intent.hold?.amountKobo ?? 0n),
              0n,
            );
            if (
              lot.launching ||
              lot.groupId !== groupId ||
              total !== BigInt(lot.heldKobo) ||
              funded.some(
                (intent) =>
                  intent.userId !== lot.leader.bidderId ||
                  intent.feeVersion !== lot.feeVersion,
              )
            )
              conflict('Preserved leader and reservation totals do not match.');
          }
          for (const [groupId, status] of Object.entries(groups))
            if (
              status === 'active' &&
              !groupIds.has(groupId) &&
              !settlements.some(
                (row) =>
                  row.groupId === groupId &&
                  ['paid', 'defaulted'].includes(row.status),
              )
            )
              conflict(
                'An active Redis group has no matching held funds or terminal settlement.',
              );
          // Detect tampered or missing final lot states, including the hidden leader commitment.
          const latest = new Map<string, (typeof entries)[number]>();
          for (const entry of entries)
            latest.set(entry.message.lotId ?? '', entry);
          for (const [lotId, entry] of latest) {
            const raw = strings.get(this.prefix + 'lot:' + lotId);
            if (!raw || !entry.message.result)
              conflict('An accepted lot state is missing.');
            const lot = JSON.parse(raw) as Record<string, unknown>;
            const result = JSON.parse(entry.message.result) as {
              state: Record<string, unknown>;
            };
            const canonical = (value: Record<string, unknown>) => {
              const leader = z
                .object({
                  bidderId: z.uuid(),
                  maxKobo: z.number().int().safe().positive(),
                })
                .parse(value.leader);
              // A verified fixed-price sale closes the lot at payment time without changing the bid book.
              return [
                value.startPriceKobo,
                value.currentPriceKobo,
                leader.bidderId,
                leader.maxKobo,
                ...(soldLots.has(lotId) ? [] : [value.endsAt]),
              ];
            };
            if (digest(canonical(lot)) !== digest(canonical(result.state)))
              conflict(
                'Preserved lot state conflicts with its latest accepted outcome.',
              );
          }
          const cursor = await tx.closingCursor.findUnique({
            where: { namespace: this.prefix },
          });
          if (
            cursor &&
            cursor.streamId !== '0-0' &&
            !entries.some((entry) => entry.id === cursor.streamId)
          )
            conflict('The closing cursor is not in the preserved stream.');
          const walletIds = [
            ...new Set([
              ...intents.map((intent) => intent.walletId),
              ...purchases.map((purchase) => purchase.walletId),
            ]),
          ].sort();
          if (walletIds.length > 500)
            conflict(
              'This wallet set exceeds the bounded offline recovery limit.',
            );
          const balances = [];
          for (let index = 0; index < walletIds.length; index += 50) {
            balances.push(
              ...(await Promise.all(
                walletIds.slice(index, index + 50).map(async (walletId) => ({
                  walletId,
                  ...(await this.ledger.readBalances(tx, walletId)),
                })),
              )),
            );
          }
          const databaseChecksum = digest([
            intents,
            receipts,
            settlements,
            launching,
            purchases,
            purchaseDebits,
            cursor,
            balances,
          ]);
          const redisChecksum = digest([...state.entries()]);
          const summary = {
            namespace: this.prefix,
            database,
            previousRunId,
            nextRunId,
            acceptedCount: receipts.length,
            activeHoldCount: active.length,
            databaseChecksum,
            redisChecksum,
          };
          return { ...summary, fingerprint: digest(summary) };
        },
        { maxWait: 60000, timeout: 60000 },
      );
    } catch (error) {
      if (error instanceof RecoveryConflictError) throw error;
      return conflict(
        'Bid recovery validation failed. No reservations were changed.',
      );
    }
  }
  async apply(value: unknown) {
    const command = commandSchema.parse(value);
    await this.options.assertOffline();
    const requestHash = digest([this.prefix, command]);
    let row = await this.stored(command.idempotencyKey);
    if (row && row.requestHash !== requestHash)
      conflict('Recovery idempotency key was used for a different request.');
    let report: Report;
    if (row)
      report = this.envelope(row.responseCiphertext, command.idempotencyKey);
    else {
      report = await this.audit();
      if (
        report.fingerprint !== command.reportFingerprint ||
        report.previousRunId === report.nextRunId
      )
        conflict('Approve the current dry-run fingerprint before recovery.');
      row = await this.ledger.db.$transaction(
        async (tx) => {
          await this.lock(tx);
          const same = await tx.idempotencyKey.findUnique({
            where: {
              scope_key: { scope: this.scope, key: command.idempotencyKey },
            },
          });
          if (same) {
            if (same.requestHash !== requestHash)
              conflict('Recovery request conflicts.');
            return same;
          }
          if (
            await tx.idempotencyKey.count({
              where: { scope: this.scope, status: 'pending' },
            })
          )
            conflict(
              'Resume the pending recovery before starting another one.',
            );
          const runtime = await tx.bidEngineRuntime.findUnique({
            where: { namespace: this.prefix },
          });
          if (runtime?.redisRunId !== report.previousRunId)
            conflict(
              'The approved runtime has already changed. Generate a new dry run.',
            );
          return tx.idempotencyKey.create({
            data: {
              scope: this.scope,
              key: command.idempotencyKey,
              requestHash,
              responseCiphertext: encryptPii(
                JSON.stringify(report),
                this.scope + ':' + command.idempotencyKey,
              ),
            },
          });
        },
        { maxWait: 60000, timeout: 15000 },
      );
    }
    if (report.nextRunId !== (await this.runId()))
      conflict('Redis restarted again. Keep recovery paused for review.');
    await this.ledger.db.$transaction(
      async (tx) => {
        await this.lock(tx);
        const current = await tx.idempotencyKey.findUniqueOrThrow({
          where: {
            scope_key: { scope: this.scope, key: command.idempotencyKey },
          },
        });
        if (current.requestHash !== requestHash)
          conflict('Recovery request conflicts.');
        const owner = await this.redis.get(this.gate);
        if (owner && owner !== command.idempotencyKey)
          conflict('A different recovery owns the namespace fence.');
        if (current.status !== 'completed') {
          await this.redis.set(this.gate, command.idempotencyKey, { NX: true });
        }
      },
      { maxWait: 60000, timeout: 15000 },
    );
    row = await this.stored(command.idempotencyKey);
    if (!row) return conflict('Durable recovery receipt is unavailable.');
    if (row.status !== 'completed') {
      let checked: Report;
      try {
        checked = await this.audit(report, command.idempotencyKey);
      } catch (error) {
        const completed = await this.stored(command.idempotencyKey);
        if (
          completed?.status !== 'completed' ||
          completed.requestHash !== requestHash
        )
          throw error;
        checked = report;
      }
      if (checked.fingerprint !== command.reportFingerprint) {
        const completed = await this.stored(command.idempotencyKey);
        if (
          completed?.status !== 'completed' ||
          completed.requestHash !== requestHash
        )
          conflict(
            'Recovery state changed after approval. Keep the fence in place.',
          );
      }
      await this.ledger.db.$transaction(
        async (tx) => {
          await this.lock(tx);
          const receipt = await tx.idempotencyKey.findUniqueOrThrow({
            where: {
              scope_key: { scope: this.scope, key: command.idempotencyKey },
            },
          });
          if (receipt.status === 'completed') return;
          const oldMarker = digest([
            report.database,
            this.prefix,
            report.previousRunId,
          ]);
          const nextMarker = digest([
            report.database,
            this.prefix,
            report.nextRunId,
          ]);
          const changed = await this.redis.eval(
            `if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end;local marker=redis.call('GET',KEYS[2]);if marker~=ARGV[2] and marker~=ARGV[3] then return 0 end;redis.call('SET',KEYS[2],ARGV[3]);return 1`,
            {
              keys: [this.gate, this.prefix + 'runtime'],
              arguments: [command.idempotencyKey, oldMarker, nextMarker],
            },
          );
          if (changed !== 1) conflict('Recovery marker changed unexpectedly.');
          await this.options.afterMarkerCommitted?.();
          const updated = await tx.bidEngineRuntime.updateMany({
            where: { namespace: this.prefix, redisRunId: report.previousRunId },
            data: { redisRunId: report.nextRunId },
          });
          if (updated.count !== 1)
            conflict('The durable runtime identity changed unexpectedly.');
          await tx.auditLog.create({
            data: {
              action: 'bid.runtime.recovered',
              entityType: 'bid_engine_runtime',
              entityId: this.prefix,
              beforeCiphertext: encryptPii(
                JSON.stringify({ redisRunId: report.previousRunId }),
                'audit',
              ),
              afterCiphertext: encryptPii(
                JSON.stringify({
                  ...report,
                  operator: command.operator,
                  reason: command.reason,
                }),
                'audit',
              ),
            },
          });
          await tx.idempotencyKey.update({
            where: { id: receipt.id },
            data: { status: 'completed' },
          });
        },
        { maxWait: 60000, timeout: 15000 },
      );
      await this.options.afterDatabaseCommitted?.();
    }
    if ((await this.runId()) !== report.nextRunId)
      conflict('Redis changed before recovery finalisation.');
    const runtime = await this.ledger.db.bidEngineRuntime.findUnique({
      where: { namespace: this.prefix },
    });
    if (runtime?.redisRunId !== report.nextRunId)
      conflict('The recovery commit could not be confirmed.');
    const released = await this.redis.eval(
      `if redis.call('GET',KEYS[2])~=ARGV[2] then return 0 end;local owner=redis.call('GET',KEYS[1]);if owner and owner~=ARGV[1] then return 0 end;if owner then redis.call('DEL',KEYS[1]) end;return 1`,
      {
        keys: [this.gate, this.prefix + 'runtime'],
        arguments: [
          command.idempotencyKey,
          digest([report.database, this.prefix, report.nextRunId]),
        ],
      },
    );
    if (released !== 1)
      conflict(
        'Recovery finalisation remains fenced. Retry the same operation.',
      );
    return {
      status: 'completed' as const,
      fingerprint: report.fingerprint,
      acceptedCount: report.acceptedCount,
      activeHoldCount: report.activeHoldCount,
    };
  }
}
