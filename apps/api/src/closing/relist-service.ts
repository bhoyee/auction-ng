import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  formatNaira,
  fromLedgerKobo,
  unsoldCountSchema,
  unsoldListInputSchema,
  unsoldPageSchema,
  unsoldRelistResultSchema,
  unsoldRelistSchema,
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
  // records) takes it off this list.
  private waiting(): Prisma.LotWhereInput {
    return {
      archivedAt: null,
      unsoldRelist: { is: null },
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
    const request = { lotId, ...value };
    const requestHash = createHash('sha256')
      .update(JSON.stringify(request))
      .digest('hex');
    const key = actorId + ':' + value.idempotencyKey;
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
          include: { images: true, settlement: true, unsoldRelist: true },
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
        if (
          value.fixedPriceKobo !== oldFixed &&
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
            startPriceKobo: BigInt(value.startPriceKobo),
            fixedPriceKobo:
              value.fixedPriceKobo === null
                ? null
                : BigInt(value.fixedPriceKobo),
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
            ` at ${formatNaira(value.startPriceKobo)}.`,
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
