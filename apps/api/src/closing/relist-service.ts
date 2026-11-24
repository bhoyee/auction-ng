import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  formatNaira,
  fromLedgerKobo,
  UNSOLD_RESTORE_DAYS,
  unsoldBulkRelistSchema,
  unsoldBulkResultSchema,
  unsoldCountSchema,
  unsoldDismissSchema,
  unsoldDismissedPageSchema,
  unsoldListInputSchema,
  unsoldPageSchema,
  unsoldRelistResultSchema,
  unsoldRelistSchema,
  unsoldRestoreResultSchema,
  type UnsoldBulkResult,
} from '@auction-ng/shared';
import type { Prisma } from '../generated/prisma/client';
import { requireStaffPermission } from '../auth/staff-access';
import { BidService } from '../bids/bid-service';
import { LedgerService } from '../ledger/ledger-service';
import { publishProblems } from '../lot-setup/publish-rules';
import { fieldError } from '../lot-setup/lot-setup-base';
import { decryptPii, encryptPii } from '../security/pii';
import { relistRules } from './relist-settings-service';

const SCOPE = 'unsold-relist';
// A "start now" relist may be a few seconds old by the time it commits.
const START_GRACE_MS = 60_000;
const RESTORE_MS = UNSOLD_RESTORE_DAYS * 86_400_000;

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

type RelistTerms = {
  /** null keeps the prices on the locked lot (bulk relist). */
  prices: { startPriceKobo: number; fixedPriceKobo: number | null } | null;
  startsAt: string | null;
  runHours: number;
  expectedUpdatedAt: string;
  reason: string;
  key: string;
  requestHash: string;
};

// Why one item of a bulk action was skipped; anything that isn't about that
// item (signed out, no permission, server fault) stops the whole request.
function skipReason(cause: unknown) {
  if (!(cause instanceof HttpException)) throw cause;
  if (![400, 404, 409].includes(cause.getStatus())) throw cause;
  const body = cause.getResponse();
  const field =
    typeof body === 'object' && 'field' in body ? body.field : undefined;
  return {
    field,
    reason:
      cause instanceof NotFoundException
        ? 'This item no longer exists.'
        : cause.message,
  };
}

const cursor = {
  read(value: string | undefined) {
    if (!value) return null;
    try {
      const parsed = z
        .object({ at: z.iso.datetime(), id: z.uuid() })
        .strict()
        .parse(JSON.parse(Buffer.from(value, 'base64url').toString()));
      return { at: new Date(parsed.at), id: parsed.id };
    } catch {
      throw new BadRequestException('Reload Unsold review and try again.');
    }
  },
  write(at: Date, id: string) {
    return Buffer.from(JSON.stringify({ at: at.toISOString(), id })).toString(
      'base64url',
    );
  },
};

// Unsold review (owner decisions 2026-11-13): items that ended with no bids
// and have no automatic relist left. Staff with "lots.relist" relist them by
// hand, optionally at a new price, through the normal scheduling path.
export class RelistService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly bids: BidService,
  ) {}

  // Unsold lots still waiting for a decision. Archiving a lot (Archived
  // records) or deleting it from Unsold review takes it off this list.
  private waiting(): Prisma.LotWhereInput {
    return {
      archivedAt: null,
      unsoldRelist: { is: null },
      unsoldDismissal: { is: null },
      settlement: {
        is: {
          namespace: this.bids.prefix,
          status: 'unsold',
          relistLotId: null,
        },
      },
    };
  }

  async count(actorId: string) {
    return this.ledger.db.$transaction(async (tx) => {
      await requireStaffPermission(tx, actorId, 'lots.relist');
      return unsoldCountSchema.parse({
        count: await tx.lot.count({ where: this.waiting() }),
      });
    });
  }

  async list(actorId: string, input: unknown) {
    const q = unsoldListInputSchema.parse(input);
    const after = cursor.read(q.cursor);
    return this.ledger.db.$transaction(async (tx) => {
      await requireStaffPermission(tx, actorId, 'lots.relist');
      const where: Prisma.LotWhereInput = {
        ...this.waiting(),
        ...(after
          ? {
              OR: [
                { settlement: { is: { closedAt: { lt: after.at } } } },
                {
                  settlement: { is: { closedAt: after.at } },
                  id: { lt: after.id },
                },
              ],
            }
          : {}),
      };
      const [rows, total, settings] = await Promise.all([
        tx.lot.findMany({
          where,
          orderBy: [{ settlement: { closedAt: 'desc' } }, { id: 'desc' }],
          take: q.limit + 1,
          include: {
            settlement: { select: { closedAt: true } },
            location: { select: { name: true } },
            bin: { select: { code: true } },
            images: {
              orderBy: { sortOrder: 'asc' },
              take: 1,
              select: { thumbnailUrl: true, url: true },
            },
          },
        }),
        tx.lot.count({ where: this.waiting() }),
        relistRules(tx),
      ]);
      const page = rows.slice(0, q.limit);
      const last = page.at(-1);
      return unsoldPageSchema.parse({
        items: page.map((lot) => ({
          id: lot.id,
          lotNumber: lot.lotNumber,
          title: lot.title,
          imageUrl: lot.images[0]?.thumbnailUrl ?? lot.images[0]?.url ?? null,
          startPriceKobo: fromLedgerKobo(lot.startPriceKobo),
          fixedPriceKobo:
            lot.fixedPriceKobo === null
              ? null
              : fromLedgerKobo(lot.fixedPriceKobo),
          retailPriceKobo: fromLedgerKobo(lot.retailPriceKobo),
          autoRelistCount: lot.autoRelistCount,
          closedAt: (lot.settlement?.closedAt ?? lot.endAt).toISOString(),
          locationName: lot.location.name,
          binCode: lot.bin?.code ?? null,
          updatedAt: lot.updatedAt.toISOString(),
        })),
        nextCursor:
          rows.length > q.limit && last
            ? cursor.write(last.settlement?.closedAt ?? last.endAt, last.id)
            : null,
        total,
        settings,
      });
    });
  }

  async relist(actorId: string, lotId: string, input: unknown) {
    const value = unsoldRelistSchema.parse(input);
    const { startPriceKobo, fixedPriceKobo } = value;
    return this.relistOne(actorId, lotId, {
      prices: { startPriceKobo, fixedPriceKobo },
      startsAt: value.startsAt,
      runHours: value.runHours,
      expectedUpdatedAt: value.expectedUpdatedAt,
      reason: value.reason,
      key: actorId + ':' + value.idempotencyKey,
      requestHash: sha256(JSON.stringify({ lotId, ...value })),
    });
  }

  // Each item commits on its own, so one refused item never blocks the rest.
  // Every item has its own key, so retrying the batch can't relist twice.
  async relistMany(actorId: string, input: unknown): Promise<UnsoldBulkResult> {
    const value = unsoldBulkRelistSchema.parse(input);
    const { startsAt, runHours, idempotencyKey } = value;
    let done = 0;
    const skipped: { id: string; reason: string }[] = [];
    let badStart: unknown;
    for (const { id, expectedUpdatedAt } of value.items)
      try {
        await this.relistOne(actorId, id, {
          prices: null,
          startsAt,
          runHours,
          expectedUpdatedAt,
          reason: 'Relist',
          key: `${actorId}:${sha256(`${idempotencyKey}:${id}`)}`,
          requestHash: sha256(
            JSON.stringify({
              bulk: true,
              id,
              startsAt,
              runHours,
              expectedUpdatedAt,
            }),
          ),
        });
        done += 1;
      } catch (cause) {
        const { field, reason } = skipReason(cause);
        if (field === 'startsAt') badStart ??= cause;
        skipped.push({ id, reason });
      }
    // A bad start time is the form's problem, but only when nothing in the
    // batch went through, now or in an earlier attempt that replayed.
    if (badStart && !done) throw badStart;
    return this.bulkResult(done, skipped);
  }

  private async bulkResult(
    done: number,
    skipped: { id: string; reason: string }[],
  ) {
    const numbers = new Map(
      skipped.length
        ? (
            await this.ledger.db.lot.findMany({
              where: { id: { in: skipped.map((item) => item.id) } },
              select: { id: true, lotNumber: true },
            })
          ).map((lot) => [lot.id, lot.lotNumber])
        : [],
    );
    return unsoldBulkResultSchema.parse({
      done,
      skipped: skipped.map((item) => ({
        ...item,
        lotNumber: numbers.get(item.id) ?? 'Unknown item',
      })),
    });
  }

  /** Takes items off Unsold review. Already deleted items count as done. */
  async dismiss(actorId: string, input: unknown): Promise<UnsoldBulkResult> {
    const { ids } = unsoldDismissSchema.parse(input);
    let done = 0;
    const skipped: { id: string; reason: string }[] = [];
    for (const id of ids)
      try {
        await this.ledger.db.$transaction(async (tx) => {
          await requireStaffPermission(tx, actorId, 'lots.relist');
          // The same lot lock as a relist: only one of the two can win.
          await tx.$queryRaw`SELECT id FROM lots WHERE id=${id}::uuid FOR UPDATE`;
          const lot = await tx.lot.findUnique({
            where: { id },
            include: {
              settlement: true,
              unsoldRelist: true,
              unsoldDismissal: true,
            },
          });
          if (!lot) throw new NotFoundException();
          if (lot.unsoldDismissal) return;
          if (
            lot.settlement?.namespace !== this.bids.prefix ||
            lot.settlement.status !== 'unsold' ||
            lot.archivedAt
          )
            throw new ConflictException('This item isn’t in Unsold review.');
          if (lot.settlement.relistLotId || lot.unsoldRelist)
            throw new ConflictException(
              'This item has already been relisted. Reload Unsold review.',
            );
          await tx.unsoldDismissal.create({ data: { lotId: id, actorId } });
          await tx.auditLog.create({
            data: {
              actorId,
              action: 'lots.unsold_dismissed',
              entityType: 'lot',
              entityId: id,
              beforeCiphertext: encryptPii(
                JSON.stringify({ inUnsoldReview: true }),
                'audit',
              ),
              afterCiphertext: encryptPii(
                JSON.stringify({ inUnsoldReview: false }),
                'audit',
              ),
            },
          });
        });
        done += 1;
      } catch (cause) {
        skipped.push({ id, reason: skipReason(cause).reason });
      }
    return this.bulkResult(done, skipped);
  }

  async dismissed(actorId: string, input: unknown) {
    const q = unsoldListInputSchema.parse(input);
    const after = cursor.read(q.cursor);
    return this.ledger.db.$transaction(async (tx) => {
      await requireStaffPermission(tx, actorId, 'lots.relist');
      const restorable: Prisma.UnsoldDismissalWhereInput = {
        dismissedAt: { gt: new Date(Date.now() - RESTORE_MS) },
        lot: {
          archivedAt: null,
          settlement: { is: { namespace: this.bids.prefix } },
        },
      };
      const [rows, total] = await Promise.all([
        tx.unsoldDismissal.findMany({
          where: {
            AND: [
              restorable,
              ...(after
                ? [
                    {
                      OR: [
                        { dismissedAt: { lt: after.at } },
                        { dismissedAt: after.at, lotId: { lt: after.id } },
                      ],
                    },
                  ]
                : []),
            ],
          },
          orderBy: [{ dismissedAt: 'desc' }, { lotId: 'desc' }],
          take: q.limit + 1,
          include: {
            actor: { select: { name: true } },
            lot: {
              select: {
                lotNumber: true,
                title: true,
                startPriceKobo: true,
                images: {
                  orderBy: { sortOrder: 'asc' },
                  take: 1,
                  select: { thumbnailUrl: true, url: true },
                },
              },
            },
          },
        }),
        tx.unsoldDismissal.count({ where: restorable }),
      ]);
      const page = rows.slice(0, q.limit);
      const last = page.at(-1);
      return unsoldDismissedPageSchema.parse({
        items: page.map(({ lotId, lot, actor, dismissedAt }) => ({
          id: lotId,
          lotNumber: lot.lotNumber,
          title: lot.title,
          imageUrl: lot.images[0]?.thumbnailUrl ?? lot.images[0]?.url ?? null,
          startPriceKobo: fromLedgerKobo(lot.startPriceKobo),
          deletedAt: dismissedAt.toISOString(),
          deletedBy: actor.name,
          restoreUntil: new Date(
            dismissedAt.getTime() + RESTORE_MS,
          ).toISOString(),
        })),
        nextCursor:
          rows.length > q.limit && last
            ? cursor.write(last.dismissedAt, last.lotId)
            : null,
        total,
      });
    });
  }

  async restore(actorId: string, lotId: string) {
    return this.ledger.db.$transaction(async (tx) => {
      await requireStaffPermission(tx, actorId, 'lots.relist');
      await tx.$queryRaw`SELECT id FROM lots WHERE id=${lotId}::uuid FOR UPDATE`;
      const lot = await tx.lot.findUnique({
        where: { id: lotId },
        include: { settlement: true, unsoldDismissal: true },
      });
      if (!lot || lot.settlement?.namespace !== this.bids.prefix)
        throw new NotFoundException();
      const done = unsoldRestoreResultSchema.parse({
        id: lotId,
        message: `${lot.lotNumber} is back in Unsold review.`,
      });
      // A retry, or another staff member restored it first.
      if (!lot.unsoldDismissal) return done;
      if (lot.archivedAt)
        throw new ConflictException(
          'This item is archived. Take it out of the archive first.',
        );
      if (Date.now() - lot.unsoldDismissal.dismissedAt.getTime() >= RESTORE_MS)
        throw new ConflictException(
          `Items can be restored for ${UNSOLD_RESTORE_DAYS} days after they’re deleted.`,
        );
      await tx.unsoldDismissal.delete({ where: { lotId } });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'lots.unsold_restored',
          entityType: 'lot',
          entityId: lotId,
          beforeCiphertext: encryptPii(
            JSON.stringify({
              inUnsoldReview: false,
              deletedAt: lot.unsoldDismissal.dismissedAt.toISOString(),
            }),
            'audit',
          ),
          afterCiphertext: encryptPii(
            JSON.stringify({ inUnsoldReview: true }),
            'audit',
          ),
        },
      });
      return done;
    });
  }

  private async relistOne(actorId: string, lotId: string, value: RelistTerms) {
    const { key, requestHash } = value;
    const replay = async (tx: Prisma.TransactionClient) => {
      const prior = await tx.idempotencyKey.findUnique({
        where: { scope_key: { scope: SCOPE, key } },
      });
      if (!prior) return null;
      if (prior.requestHash !== requestHash || !prior.responseCiphertext)
        throw new ConflictException(
          'This request key belongs to another relist.',
        );
      return unsoldRelistResultSchema.parse(
        JSON.parse(decryptPii(Buffer.from(prior.responseCiphertext), SCOPE)),
      );
    };
    return this.ledger.db.$transaction(
      async (tx) => {
        const access = await requireStaffPermission(tx, actorId, 'lots.relist');
        // A finished relist replays its saved result, even while publishing
        // is paused.
        const done = await replay(tx);
        if (done) return done;
        await this.bids.guardAuctionPublication(tx);
        // Lock, then check again: a concurrent retry with the same key waits
        // here and then returns the first result.
        await tx.$queryRaw`SELECT id FROM lots WHERE id=${lotId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT lot_id FROM lot_settlements WHERE lot_id=${lotId}::uuid FOR UPDATE`;
        const prior = await replay(tx);
        if (prior) return prior;
        const old = await tx.lot.findUnique({
          where: { id: lotId },
          include: {
            images: true,
            settlement: true,
            unsoldRelist: true,
            unsoldDismissal: true,
          },
        });
        if (!old) throw new NotFoundException();
        const settlement = old.settlement;
        if (
          !settlement ||
          settlement.namespace !== this.bids.prefix ||
          settlement.status !== 'unsold' ||
          old.archivedAt
        )
          throw new ConflictException(
            'Only unsold items in Unsold review can be relisted.',
          );
        if (settlement.relistLotId || old.unsoldRelist)
          throw new ConflictException(
            'This item has already been relisted. Reload Unsold review.',
          );
        if (old.unsoldDismissal)
          throw new ConflictException(
            'This item was deleted from Unsold review. Restore it first.',
          );
        if (old.updatedAt.toISOString() !== value.expectedUpdatedAt)
          throw new ConflictException('This item changed. Reload it first.');
        // Settlement rules already exclude sold items; this guards against a
        // Buy Now purchase if those rules ever change.
        if (
          old.status !== 'closed' ||
          (await tx.purchase.count({
            where: { lotId, status: { in: ['pending', 'paid'] } },
          }))
        )
          throw new ConflictException(
            'Only unsold items in Unsold review can be relisted.',
          );
        // Setting a buy-now price needs the same permission as the fixed
        // price editor (auctions.manage); keeping the old one does not.
        const oldFixed =
          old.fixedPriceKobo === null
            ? null
            : fromLedgerKobo(old.fixedPriceKobo);
        const { startPriceKobo, fixedPriceKobo } = value.prices ?? {
          startPriceKobo: fromLedgerKobo(old.startPriceKobo),
          fixedPriceKobo: oldFixed,
        };
        if (
          fixedPriceKobo !== oldFixed &&
          !access.permissions.includes('auctions.manage')
        )
          throw fieldError(
            'fixedPriceKobo',
            'Your role can’t change the buy-now price. Keep it as it was or ask an admin.',
            403,
          );
        const now = Date.now();
        const startsAt = value.startsAt ? Date.parse(value.startsAt) : now;
        if (startsAt < now - START_GRACE_MS)
          throw fieldError(
            'startsAt',
            'Choose a start time in the future, or start now.',
            400,
          );
        const start = new Date(Math.max(startsAt, now));
        const end = new Date(start.getTime() + value.runHours * 3_600_000);
        const next = await tx.lot.create({
          data: {
            title: old.title,
            description: old.description,
            condition: old.condition,
            retailPriceKobo: old.retailPriceKobo,
            startPriceKobo: BigInt(startPriceKobo),
            fixedPriceKobo:
              fixedPriceKobo === null ? null : BigInt(fixedPriceKobo),
            categoryId: old.categoryId,
            locationId: old.locationId,
            binId: old.binId,
            brandId: old.brandId,
            details: old.details ?? {},
            autoRelistEnabled: old.autoRelistEnabled,
            // A staff relist starts a fresh set of automatic retries.
            autoRelistCount: 0,
            isTopDeal: old.isTopDeal,
            topDealOrder: old.topDealOrder,
            // Same path as any scheduled auction: the launch worker opens it
            // at startAt (straight away for "start now").
            status: 'scheduled',
            startAt: start,
            endAt: end,
            scheduleVersion: 1,
            images: {
              create: old.images.map((image) => ({
                url: image.url,
                sortOrder: image.sortOrder,
                thumbnailUrl: image.thumbnailUrl,
                width: image.width,
                height: image.height,
                thumbnailBytes: image.thumbnailBytes,
              })),
            },
          },
        });
        // Lot setup rules (photos, details, condition, bin rule) apply to a
        // relist exactly as to any newly scheduled lot.
        const problems = await publishProblems(tx, next.id);
        if (problems.length) throw fieldError('form', problems.join(' '), 400);
        // The unique key on unsold_relists.lot_id is the final guard: one
        // relist per unsold item, even if two requests got this far.
        await tx.unsoldRelist.create({
          data: { lotId, relistLotId: next.id, actorId },
        });
        const result = unsoldRelistResultSchema.parse({
          lotId: next.id,
          lotNumber: next.lotNumber,
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          message:
            (value.startsAt ? 'Relist scheduled' : 'Relisted') +
            ` at ${formatNaira(startPriceKobo)}.`,
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'lots.unsold_relisted',
            entityType: 'lot',
            entityId: lotId,
            beforeCiphertext: encryptPii(
              JSON.stringify({
                startPriceKobo: old.startPriceKobo.toString(),
                fixedPriceKobo: old.fixedPriceKobo?.toString() ?? null,
                autoRelistCount: old.autoRelistCount,
              }),
              'audit',
            ),
            afterCiphertext: encryptPii(
              JSON.stringify({ ...result, reason: value.reason }),
              'audit',
            ),
          },
        });
        await tx.idempotencyKey.create({
          data: {
            userId: actorId,
            scope: SCOPE,
            key,
            requestHash,
            status: 'completed',
            responseCiphertext: encryptPii(JSON.stringify(result), SCOPE),
          },
        });
        return result;
      },
      { maxWait: 15000, timeout: 15000 },
    );
  }
}
