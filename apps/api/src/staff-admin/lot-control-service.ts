import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  lotControlInputSchema,
  lotControlQuoteSchema,
  fromLedgerKobo,
} from '@auction-ng/shared';
import type { StaffAdminService } from './staff-admin-service';
import type { BidService } from '../bids/bid-service';
import type { AuthIdentity } from '../auth/auth-service';
import { encryptPii, decryptPii } from '../security/pii';
const planSchema = z
  .object({
    status: z.literal('fenced'),
    id: z.uuid(),
    operation: z.string(),
    lotId: z.uuid(),
    endsAt: z.number().int().safe(),
    oldEndAt: z.number().int().safe(),
    pausedAt: z.number().int().safe(),
    remainingMs: z.number().int().safe(),
    at: z.number().int().safe(),
    barrierId: z.string(),
    lot: z.record(z.string(), z.unknown()),
  })
  .strict();
const encode = (v: unknown) => encryptPii(JSON.stringify(v), 'lot-control');
const decode = (v: Uint8Array) =>
  JSON.parse(decryptPii(Buffer.from(v), 'lot-control')) as unknown;

export class LotControlService {
  afterCommit?: () => Promise<void>;
  constructor(
    private readonly staff: StaffAdminService,
    private readonly bids: BidService,
  ) {}
  private async access(who: AuthIdentity) {
    return this.staff.ledger.db.$transaction(async (tx) => {
      const access = await this.staff.actor(tx, who, 'auctions.manage');
      if (!['admin', 'manager'].includes(access.user.role))
        throw new ForbiddenException(
          'Only administrators and operations managers may control an item.',
        );
    });
  }
  async quote(who: AuthIdentity, lotId: string) {
    await this.access(who);
    const lot = await this.staff.ledger.db.lot.findUnique({
      where: { id: lotId },
    });
    if (!lot) throw new NotFoundException();
    const books = await this.bids.monitorBooks([lotId]),
      book = books.states[0];
    const totals = await this.staff.ledger.db.$queryRaw<
      { total: bigint; buyers: bigint }[]
    >`
      SELECT COALESCE(SUM(h.amount_kobo),0)::bigint AS total,COUNT(DISTINCT i.user_id)::bigint AS buyers
      FROM bid_funding_intents i JOIN wallet_holds h ON h.id=i.hold_id WHERE i.namespace=${this.bids.prefix} AND i.lot_id=${lotId}::uuid AND h.status='active'`;
    return lotControlQuoteSchema.parse({
      lotId,
      reference: lot.lotNumber,
      status: lot.status,
      paused: !!book?.pausedAt,
      endsAt: new Date(book?.endsAt ?? lot.endAt.getTime()).toISOString(),
      remainingMs: Math.max(
        0,
        (book?.endsAt ?? lot.endAt.getTime()) -
          (book?.pausedAt ?? Date.parse(books.serverTime)),
      ),
      revision: book?.streamId ?? '0-0',
      bidCount: await this.staff.ledger.db.bid.count({ where: { lotId } }),
      heldKobo: fromLedgerKobo(totals[0]?.total ?? 0n),
      buyerCount: Number(totals[0]?.buyers ?? 0n),
      serverTime: books.serverTime,
    });
  }
  async request(who: AuthIdentity, input: unknown) {
    const value = lotControlInputSchema.parse(input);
    await this.access(who);
    await this.staff.mutation(
      who,
      { ...value, id: value.lotId },
      'auctions.manage',
      'lot_' + value.operation + '_requested',
      async (tx) => {
        await this.bids.guardAuctionPublication(tx);
        if (
          await tx.auctionPauseCommand.findFirst({
            where: {
              namespace: this.bids.prefix,
              status: { not: 'completed' },
            },
          })
        )
          throw new ConflictException(
            'A global control is still being applied.',
          );
        await tx.$queryRaw`SELECT id FROM lots WHERE id=${value.lotId}::uuid FOR UPDATE`;
        const lot = await tx.lot.findUnique({ where: { id: value.lotId } });
        if (!lot || lot.archivedAt || !['open', 'closing'].includes(lot.status))
          throw new ConflictException('Only live unsold items can be changed.');
        if (
          await tx.lotControlCommand.findFirst({
            where: {
              namespace: this.bids.prefix,
              lotId: value.lotId,
              status: { in: ['pending', 'committed'] },
            },
          })
        )
          throw new ConflictException(
            'An item control is still being completed.',
          );
        await tx.lotControlCommand.create({
          data: {
            id: value.idempotencyKey,
            namespace: this.bids.prefix,
            lotId: value.lotId,
            actorId: who.user.id,
            operation: value.operation,
            requestCiphertext: encode(value),
          },
        });
        return { id: value.idempotencyKey, message: 'Item control queued.' };
      },
    );
    await this.advance(value.idempotencyKey);
    const row = await this.staff.ledger.db.lotControlCommand.findUniqueOrThrow({
      where: { id: value.idempotencyKey },
    });
    if (row.status === 'failed')
      throw new ConflictException(
        'The item changed or needs another confirmation. Close this dialog, review its live status and try again.',
      );
    return {
      id: row.id,
      message:
        row.status === 'completed'
          ? `Item ${value.operation === 'pause' ? 'paused' : value.operation === 'resume' ? 'resumed' : value.operation === 'extend' ? 'time extended' : 'cancelled; reserved bid funds released'}.`
          : 'This request is being completed safely. Keep the same request if retrying.',
    };
  }
  async advance(id?: string) {
    // Same lock as global restoration prevents overlapping clock transformations.
    return this.staff.ledger.db.$transaction(
      async (lock) => {
        const [lease] = await lock.$queryRaw<
          { locked: boolean }[]
        >`SELECT pg_try_advisory_xact_lock(hashtextextended(${this.bids.prefix},716)) AS locked`;
        if (!lease?.locked) return;
        const row = await this.staff.ledger.db.lotControlCommand.findFirst({
          where: {
            namespace: this.bids.prefix,
            status: { in: ['pending', 'committed'] },
            ...(id ? { id } : {}),
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        if (!row) return;
        const value = lotControlInputSchema.parse(
          decode(row.requestCiphertext),
        );
        if (row.status === 'pending') {
          // Load a missing empty book through normal initialization, never overwrite one.
          if (!(await this.bids.monitorBooks([row.lotId])).states[0])
            await this.bids.loadLot(row.lotId);
          const raw = await this.bids.lotControl(
            row.lotId,
            row.id,
            row.operation,
            'begin',
            value.expectedRevision,
            value.extensionMs ?? 0,
            value.confirmation ?? '',
          );
          const parsed = planSchema.safeParse(raw);
          if (!parsed.success) {
            const status = z.object({ status: z.string() }).parse(raw).status;
            if (['stale', 'confirm', 'invalid', 'busy'].includes(status)) {
              await this.staff.ledger.db.lotControlCommand.update({
                where: { id: row.id },
                data: { status: 'failed', completedAt: new Date() },
              });
              return;
            }
            throw new ServiceUnavailableException(
              'The item is busy. Retry the same request after current checkout or controls complete.',
            );
          }
          const plan = parsed.data;
          await this.bids.persistThrough(plan.barrierId);
          await this.staff.ledger.db.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM lots WHERE id=${row.lotId}::uuid FOR UPDATE`;
            const current = await tx.lotControlCommand.findUniqueOrThrow({
              where: { id: row.id },
            });
            if (current.status !== 'pending') return;
            const lot = await tx.lot.findUniqueOrThrow({
              where: { id: row.lotId },
            });
            if (
              !['open', 'closing'].includes(lot.status) ||
              (await tx.purchase.count({
                where: { lotId: row.lotId, status: 'paid' },
              })) ||
              (await tx.lotSettlement.count({ where: { lotId: row.lotId } }))
            )
              throw new ConflictException(
                'A completed purchase cannot be cancelled or changed.',
              );
            await tx.lot.update({
              where: { id: row.lotId },
              data: {
                ...(row.operation === 'resume'
                  ? {}
                  : { endAt: new Date(plan.endsAt) }),
                ...(row.operation === 'pause'
                  ? { pausedAt: new Date(plan.pausedAt) }
                  : {}),
                ...(row.operation === 'cancel' ? { pausedAt: null } : {}),
                ...(row.operation === 'cancel'
                  ? { status: 'cancelled', autoRelistEnabled: false }
                  : {}),
              },
            });
            await tx.lotControlCommand.update({
              where: { id: row.id },
              data: {
                status: 'committed',
                snapshotCiphertext: encode(plan),
                oldEndAt: BigInt(plan.oldEndAt),
                newEndAt: BigInt(plan.endsAt),
                effectiveAt: new Date(plan.at),
              },
            });
            await tx.auditLog.create({
              data: {
                actorId: row.actorId,
                action: 'lot.' + row.operation,
                entityType: 'lot',
                entityId: row.lotId,
                beforeCiphertext: encryptPii(
                  JSON.stringify({
                    endAt: new Date(plan.oldEndAt).toISOString(),
                    status: lot.status,
                  }),
                  'audit',
                ),
                afterCiphertext: encryptPii(
                  JSON.stringify({
                    endAt: new Date(plan.endsAt).toISOString(),
                    reason: value.reason,
                    category: value.category,
                    operation: row.operation,
                    commandId: row.id,
                  }),
                  'audit',
                ),
              },
            });
          });
          await this.afterCommit?.();
        }
        const current =
          await this.staff.ledger.db.lotControlCommand.findUniqueOrThrow({
            where: { id: row.id },
          });
        if (current.status !== 'committed' || !current.snapshotCiphertext)
          return;
        const plan = planSchema.parse(decode(current.snapshotCiphertext));
        if (row.operation === 'cancel') {
          // The item row was made terminal before scanning. Concurrent preparation
          // also locks that row, so it cannot add a reservation after this point.
          for (;;) {
            const held = await this.staff.ledger.db.bidFundingIntent.findMany({
              where: {
                namespace: this.bids.prefix,
                lotId: row.lotId,
                hold: { status: 'active' },
              },
              orderBy: [{ walletId: 'asc' }, { id: 'asc' }],
              take: 50,
            });
            if (!held.length) break;
            for (const intent of held)
              if (intent.holdId)
                await this.staff.ledger.db.$transaction(async (tx) => {
                  await this.staff.ledger.releaseInTransaction(tx, {
                    walletId: intent.walletId,
                    holdId: intent.holdId ?? '',
                    idempotencyKey: 'lot-cancel:' + row.id + ':' + intent.id,
                    reference: 'lot-cancel:' + row.id + ':' + intent.id,
                  });
                  await tx.bidFundingIntent.update({
                    where: { id: intent.id },
                    data: { status: 'released' },
                  });
                });
          }
        }
        const result = z
          .object({ status: z.literal('completed') })
          .safeParse(
            await this.bids.lotControl(
              row.lotId,
              row.id,
              row.operation,
              'commit',
            ),
          );
        if (!result.success)
          throw new ServiceUnavailableException(
            'The committed item control is awaiting its engine receipt.',
          );
        if (row.operation === 'cancel')
          await this.bids.releaseClosedPreparations(row.lotId);
        if (row.operation === 'resume') {
          let opened = false;
          for (let attempt = 0; attempt < 3; attempt++) {
            const final = z
              .object({
                status: z.enum(['ready', 'completed']),
                endsAt: z.number().int().safe(),
                at: z.number().int().safe(),
              })
              .parse(
                await this.bids.lotControl(
                  row.lotId,
                  row.id,
                  row.operation,
                  'finalize',
                ),
              );
            if (final.status === 'ready')
              await this.staff.ledger.db.$transaction(async (tx) => {
                await tx.$queryRaw`SELECT id FROM lots WHERE id=${row.lotId}::uuid FOR UPDATE`;
                await tx.lot.update({
                  where: { id: row.lotId },
                  data: {
                    endAt: new Date(final.endsAt),
                    pausedAt: new Date(final.at),
                  },
                });
                await tx.lotControlCommand.update({
                  where: { id: row.id },
                  data: {
                    newEndAt: BigInt(final.endsAt),
                    effectiveAt: new Date(final.at),
                  },
                });
                await tx.auditLog.create({
                  data: {
                    actorId: row.actorId,
                    entityType: 'lot',
                    entityId: row.lotId,
                    action: 'lot.resume_clock_restored',
                    beforeCiphertext: encryptPii(
                      JSON.stringify({
                        endAt: new Date(plan.oldEndAt).toISOString(),
                      }),
                      'audit',
                    ),
                    afterCiphertext: encryptPii(
                      JSON.stringify({
                        commandId: row.id,
                        endAt: new Date(final.endsAt).toISOString(),
                        reason: value.reason,
                      }),
                      'audit',
                    ),
                  },
                });
              });
            const outcome = z
              .object({ status: z.string() })
              .parse(
                await this.bids.lotControl(
                  row.lotId,
                  row.id,
                  row.operation,
                  'open',
                ),
              );
            if (outcome.status === 'completed') {
              opened = true;
              break;
            }
            if (outcome.status !== 'needs_finalization')
              throw new ServiceUnavailableException(
                'Resume remains fenced until the clock restoration is confirmed.',
              );
          }
          if (!opened) return;
        }
        await this.staff.ledger.db.$transaction(async (tx) => {
          const message =
            row.operation === 'cancel'
              ? 'This auction was cancelled. No winner was declared. Reserved bid funds have been released.'
              : row.operation === 'pause'
                ? 'Bidding is paused by LotVanta while we review this item. Your remaining time and reserved funds are protected.'
                : row.operation === 'resume'
                  ? 'Bidding has resumed. The auction retains the time remaining when it was paused.'
                  : `The auction time has been extended by ${(value.extensionMs ?? 0) / 60000} minutes. New closing time: ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(plan.endsAt))} WAT.`;
          await tx.lotBidderMessage.upsert({
            where: { id: row.id },
            create: {
              id: row.id,
              lotId: row.lotId,
              actorId: row.actorId,
              cutoffAt: new Date(plan.at),
              messageCiphertext: encryptPii(message, 'lot-message'),
            },
            update: {},
          });
        });
        const opened = z
          .object({ status: z.literal('completed') })
          .safeParse(
            await this.bids.lotControl(
              row.lotId,
              row.id,
              row.operation,
              'open',
            ),
          );
        if (!opened.success)
          throw new ServiceUnavailableException(
            'This item control remains fenced until reconciliation completes.',
          );
        await this.staff.ledger.db.$transaction(async (tx) => {
          if (row.operation === 'resume')
            await tx.lot.updateMany({
              where: { id: row.lotId, status: { in: ['open', 'closing'] } },
              data: { pausedAt: null },
            });
          await tx.lotControlCommand.update({
            where: { id: row.id },
            data: { status: 'completed', completedAt: new Date() },
          });
        });
      },
      { timeout: 120000, maxWait: 5000 },
    );
  }
}
