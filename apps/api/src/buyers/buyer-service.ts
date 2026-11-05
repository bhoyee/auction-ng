import { BadRequestException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import {
  buyerBidPageSchema,
  buyerPreBidPageSchema,
  buyerNotificationPageSchema,
  buyerInvoicePageSchema,
  buyerInvoiceDetailSchema,
  watchPageSchema,
  catalogueRules,
  fromLedgerKobo,
  awaitingPickupStatuses,
  watchActivityPageSchema,
} from '@auction-ng/shared';
import { createDatabase } from '../database/client';
import { bidHistoryPrice } from './bid-history';
import type { Prisma } from '../generated/prisma/client';

function notWonLot(userId: string): Prisma.LotWhereInput {
  return {
    AND: [
      {
        OR: [
          { settlement: { is: null } },
          { settlement: { is: { winnerId: null } } },
          { settlement: { is: { winnerId: { not: userId } } } },
        ],
      },
      { purchases: { none: { userId, status: 'paid' } } },
    ],
  };
}

const lotSelect = {
  id: true,
  lotNumber: true,
  title: true,
  status: true,
  images: {
    select: { thumbnailUrl: true },
    orderBy: { sortOrder: 'asc' },
    take: 1,
  },
  location: { select: { name: true } },
} as const;
function buyerLot(lot: {
  id: string;
  lotNumber: string;
  title: string;
  status: string;
  images: { thumbnailUrl: string | null }[];
  location: { name: string };
}) {
  return {
    id: lot.id,
    lotNumber: lot.lotNumber,
    title: lot.title,
    status: lot.status,
    thumbnailUrl: lot.images[0]?.thumbnailUrl ?? null,
    locationName: lot.location.name,
  };
}
const cursorSchema = z
  .object({ id: z.uuid(), at: z.iso.datetime(), scope: z.string() })
  .strict();
function decode(cursor: string | undefined, scope: string) {
  if (!cursor) return undefined;
  try {
    const value = cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString()),
    );
    if (value.scope !== scope) throw new Error();
    return value;
  } catch {
    throw new BadRequestException('Use the next cursor for this list.');
  }
}
function next(id: string, at: Date, scope: string) {
  return Buffer.from(
    JSON.stringify({ id, at: at.toISOString(), scope }),
  ).toString('base64url');
}
function money<
  T extends {
    hammerTotalKobo: bigint;
    premiumKobo: bigint;
    lotFeeKobo: bigint;
    vatKobo: bigint;
    totalKobo: bigint;
  },
>(row: T) {
  const { purchase, ...rest } = row as T & { purchase?: { id: string } | null };
  return {
    ...rest,
    saleType: purchase ? 'fixed_price' : 'auction',
    hammerTotalKobo: fromLedgerKobo(row.hammerTotalKobo),
    premiumKobo: fromLedgerKobo(row.premiumKobo),
    lotFeeKobo: fromLedgerKobo(row.lotFeeKobo),
    vatKobo: fromLedgerKobo(row.vatKobo),
    totalKobo: fromLedgerKobo(row.totalKobo),
  };
}
const invoiceSelect = {
  purchase: { select: { id: true } },
  id: true,
  number: true,
  status: true,
  hammerTotalKobo: true,
  premiumKobo: true,
  lotFeeKobo: true,
  vatKobo: true,
  totalKobo: true,
  createdAt: true,
} as const;

export class BuyerService {
  async notificationSummary(userId: string) {
    const [unread, awaitingPickup] = await Promise.all([
      this.db.notification.count({
        where: {
          userId,
          template: {
            in: [
              'auction-result-v1',
              'watch-lost-v1',
              'outbid-v1',
              'withdrawal-v1',
              'support-v1',
              'prebid-v1',
              'bid-cancellation-v1',
              'staff-refund-v1',
            ],
          },
          readAt: null,
        },
      }),
      this.db.fulfilment.count({
        where: {
          userId,
          type: 'pickup',
          collectedAt: null,
          status: { in: [...awaitingPickupStatuses] },
          invoice: { status: 'paid' },
        },
      }),
    ]);
    return { unread, awaitingPickup };
  }
  async readNotifications(userId: string, ids: string[]) {
    const result = await this.db.notification.updateMany({
      where: {
        userId,
        id: { in: ids },
        template: {
          in: [
            'auction-result-v1',
            'watch-lost-v1',
            'outbid-v1',
            'withdrawal-v1',
            'support-v1',
            'prebid-v1',
            'bid-cancellation-v1',
            'staff-refund-v1',
          ],
        },
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
  async watchActivity(
    userId: string,
    view: 'watching' | 'won' | 'lost',
    limit: number,
    cursor?: string,
  ) {
    const scope = `watch-activity:${userId}:${view}`;
    const anchor = decode(cursor, scope);
    const won = {
      OR: [
        { settlement: { is: { winnerId: userId } } },
        { purchases: { some: { userId, status: 'paid' } } },
      ],
    };
    const notWon = notWonLot(userId);
    const rows = await this.db.watchlist.findMany({
      where: {
        userId,
        lot:
          view === 'won'
            ? won
            : view === 'lost'
              ? { status: 'closed', ...notWon }
              : {
                  status: { in: [...catalogueRules.browseStatuses] },
                  ...notWon,
                },
        ...(anchor
          ? {
              OR: [
                { createdAt: { lt: new Date(anchor.at) } },
                { createdAt: new Date(anchor.at), lotId: { lt: anchor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { lotId: 'desc' }],
      take: limit + 1,
      select: {
        lotId: true,
        createdAt: true,
        lot: {
          select: {
            ...lotSelect,
            startPriceKobo: true,
            retailPriceKobo: true,
            startAt: true,
            endAt: true,
            location: { select: { name: true, address: true } },
            settlement: { select: { winnerId: true, hammerKobo: true } },
            purchases: {
              where: { status: 'paid' },
              select: { userId: true, priceKobo: true },
              take: 1,
            },
          },
        },
      },
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return watchActivityPageSchema.parse({
      items: page.map(({ lot }) => {
        const purchase = lot.purchases[0];
        const price = purchase?.priceKobo ?? lot.settlement?.hammerKobo;
        return {
          id: lot.id,
          title: lot.title,
          lotNumber: lot.lotNumber,
          thumbnailUrl: lot.images[0]?.thumbnailUrl ?? null,
          locationName: lot.location.name,
          locationAddress: lot.location.address,
          startPriceKobo: fromLedgerKobo(lot.startPriceKobo),
          retailPriceKobo: fromLedgerKobo(lot.retailPriceKobo),
          finalPriceKobo: price == null ? null : fromLedgerKobo(price),
          endsAt: lot.endAt.toISOString(),
          startsAt: lot.startAt.toISOString(),
          status: lot.status,
          outcome:
            view === 'won'
              ? 'won'
              : view === 'watching'
                ? 'watching'
                : purchase || lot.settlement?.winnerId
                  ? 'lost'
                  : lot.settlement
                    ? 'unsold'
                    : 'pending',
        };
      }),
      nextCursor:
        rows.length > limit && last
          ? next(last.lotId, last.createdAt, scope)
          : null,
    });
  }
  async notifications(userId: string, limit: number, cursor?: string) {
    const scope = `notifications:${userId}`;
    const anchor = decode(cursor, scope);
    const rows = await this.db.notification.findMany({
      where: {
        userId,
        template: {
          in: [
            'auction-result-v1',
            'watch-lost-v1',
            'outbid-v1',
            'withdrawal-v1',
            'support-v1',
            'prebid-v1',
            'bid-cancellation-v1',
            'staff-refund-v1',
          ],
        },
        ...(anchor
          ? {
              OR: [
                { createdAt: { lt: new Date(anchor.at) } },
                { createdAt: new Date(anchor.at), id: { lt: anchor.id } },
              ],
            }
          : {}),
      },
      select: { id: true, createdAt: true, reference: true, readAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return buyerNotificationPageSchema.parse({
      items: page.map((row) => ({
        id: row.id,
        title: row.reference?.startsWith('staff-refund:')
          ? 'Your purchase was refunded to your wallet'
          : row.reference?.startsWith('rebid:')
            ? 'An auction reopened. Place a fresh bid if interested'
            : row.reference?.startsWith('bid-cancel:')
              ? 'Your bid cancellation is complete; view the fee in your wallet'
              : row.reference?.startsWith('prebid:')
                ? 'Your pre-bid was cancelled; reserved funds were released'
                : row.reference?.startsWith('support:')
                  ? 'An update from LotVanta support'
                  : row.reference?.startsWith('withdrawal:')
                    ? row.reference.endsWith(':cancelled')
                      ? 'Your withdrawal was cancelled'
                      : row.reference.endsWith(':success')
                        ? 'Your withdrawal was sent'
                        : row.reference.endsWith(':reversed')
                          ? 'Your withdrawal was reversed'
                          : 'Your withdrawal did not complete'
                    : row.reference?.startsWith('outbid:')
                      ? 'You were outbid. View item to bid again'
                      : row.reference?.startsWith('watch-lost:')
                        ? 'Another buyer won an item you watched'
                        : row.reference?.startsWith('purchase:')
                          ? 'Your Buy Now purchase is confirmed'
                          : 'Your auction result is ready',
        href: row.reference?.startsWith('staff-refund:')
          ? '/wallet'
          : row.reference?.startsWith('rebid:') ||
              row.reference?.startsWith('bid-cancel:')
            ? '/lots/' + z.uuid().parse(row.reference.split(':')[1])
            : row.reference?.startsWith('prebid:')
              ? '/upcoming-deals'
              : row.reference?.startsWith('support:')
                ? '/customer-service?conversation=' +
                  z.uuid().parse(row.reference.split(':')[1])
                : row.reference?.startsWith('withdrawal:')
                  ? '/wallet'
                  : row.reference?.startsWith('outbid:')
                    ? `/lots/${z.uuid().parse(row.reference.split(':')[3])}`
                    : row.reference?.startsWith('watch-lost:')
                      ? `/lots/${z.uuid().parse(row.reference.split(':')[1])}`
                      : row.reference?.startsWith('purchase:')
                        ? '/awaiting-pickup'
                        : '/invoices',
        createdAt: row.createdAt.toISOString(),
        readAt: row.readAt?.toISOString() ?? null,
      })),
      nextCursor:
        rows.length > limit && last
          ? next(last.id, last.createdAt, scope)
          : null,
    });
  }
  readonly db;
  constructor(databaseUrl?: string) {
    this.db = createDatabase(databaseUrl ?? process.env.DATABASE_URL);
  }
  async onModuleDestroy() {
    await this.db.$disconnect();
  }

  async watch(userId: string, lotId: string, watching: boolean) {
    const lot = await this.db.lot.findFirst({
      where: { id: lotId, status: { in: [...catalogueRules.publicStatuses] } },
      select: { id: true },
    });
    if (!lot) throw new NotFoundException();
    if (watching)
      await this.db.watchlist.upsert({
        where: { userId_lotId: { userId, lotId } },
        create: { userId, lotId },
        update: {},
      });
    else await this.db.watchlist.deleteMany({ where: { userId, lotId } });
    return { watching };
  }
  async watched(userId: string, lotIds: string[]) {
    const rows = await this.db.watchlist.findMany({
      where: { userId, lotId: { in: lotIds } },
      select: { lotId: true },
    });
    return { lotIds: rows.map((row) => row.lotId) };
  }
  async watchCount(userId: string) {
    return {
      count: await this.db.watchlist.count({
        where: {
          userId,
          lot: {
            status: { in: [...catalogueRules.browseStatuses] },
            ...notWonLot(userId),
          },
        },
      }),
    };
  }
  async lotHistory(lotId: string, limit: number, cursor?: string) {
    const lot = await this.db.lot.findFirst({
      where: { id: lotId, status: { in: [...catalogueRules.publicStatuses] } },
      select: { id: true },
    });
    if (!lot) throw new NotFoundException();
    const scope = `lot-history:${lotId}`;
    const anchor = decode(cursor, scope);
    const rows = await this.db.bid.findMany({
      where: {
        lotId,
        role: 'request',
        acceptanceId: { not: null },
        ...(anchor
          ? {
              OR: [
                { createdAt: { lt: new Date(anchor.at) } },
                { createdAt: new Date(anchor.at), id: { lt: anchor.id } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        createdAt: true,
        acceptance: { select: { result: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        ...bidHistoryPrice(row.acceptance?.result, lotId),
      })),
      nextCursor:
        rows.length > limit && last
          ? next(last.id, last.createdAt, scope)
          : null,
    };
  }
  async watches(userId: string, limit: number, cursor?: string) {
    const scope = `watch:${userId}`;
    const anchor = decode(cursor, scope);
    const rows = await this.db.watchlist.findMany({
      where: {
        userId,
        lot: { status: { in: [...catalogueRules.publicStatuses] } },
        ...(anchor
          ? {
              OR: [
                { createdAt: { lt: new Date(anchor.at) } },
                { createdAt: new Date(anchor.at), lotId: { lt: anchor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { lotId: 'desc' }],
      take: limit + 1,
      select: { lot: { select: lotSelect }, createdAt: true, lotId: true },
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return watchPageSchema.parse({
      items: page.map(({ lot, createdAt }) => ({
        lot: buyerLot(lot),
        createdAt: createdAt.toISOString(),
      })),
      nextCursor:
        rows.length > limit && last
          ? next(last.lotId, last.createdAt, scope)
          : null,
    });
  }
  async preBids(
    userId: string,
    limit: number,
    cursor?: string,
    view: 'incoming' | 'cancelled' = 'incoming',
  ) {
    const scope = `prebid:${userId}:${view}`;
    const anchor = decode(cursor, scope);
    const rows = await this.db.preBid.findMany({
      where: {
        userId,
        status:
          view === 'incoming' ? { in: ['active', 'launching'] } : 'cancelled',
        ...(view === 'incoming' ? { lot: { status: 'scheduled' } } : {}),
        ...(anchor
          ? {
              OR: [
                { createdAt: { lt: new Date(anchor.at) } },
                { createdAt: new Date(anchor.at), id: { lt: anchor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        lot: { select: { ...lotSelect, startAt: true } },
        hold: { select: { status: true, amountKobo: true } },
      },
    });
    const page = rows.slice(0, limit),
      last = page.at(-1);
    const serverTime = new Date().toISOString();
    return buyerPreBidPageSchema.parse({
      items: page.map((row) => ({
        id: row.id,
        lotId: row.lotId,
        lot: buyerLot(row.lot),
        maxKobo: fromLedgerKobo(row.maxKobo),
        totalKobo: fromLedgerKobo(row.totalKobo),
        reservedKobo:
          row.hold.status === 'active'
            ? fromLedgerKobo(row.hold.amountKobo)
            : 0,
        feeVersion: row.feeVersion,
        revision: row.revision,
        status: row.status,
        startsAt: row.lot.startAt.toISOString(),
        serverTime,
      })),
      nextCursor:
        rows.length > limit && last
          ? next(last.id, last.createdAt, scope)
          : null,
      serverTime,
    });
  }
  async bids(userId: string, limit: number, cursor?: string, lotId?: string) {
    const scope = lotId ? `bid:${userId}:${lotId}` : `bid:${userId}`;
    const anchor = decode(cursor, scope);
    const rows = await this.db.bid.findMany({
      where: {
        userId,
        ...(lotId ? { lotId } : {}),
        ...(anchor
          ? {
              OR: [
                { createdAt: { lt: new Date(anchor.at) } },
                { createdAt: new Date(anchor.at), id: { lt: anchor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        lot: {
          select: {
            ...lotSelect,
            settlement: { select: { winnerId: true } },
            bidRound: true,
            cancellationApprovals: {
              where: {
                buyerId: userId,
                status: { in: ['committed', 'completed'] },
              },
              select: { id: true },
              take: 1,
            },
            purchases: {
              where: { status: 'paid' },
              select: { id: true },
              take: 1,
            },
          },
        },
        amountKobo: true,
        isProxy: true,
        acceptance: { select: { intent: { select: { bidRound: true } } } },
        createdAt: true,
      },
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return buyerBidPageSchema.parse({
      items: page.map((row) => ({
        id: row.id,
        lot: buyerLot(row.lot),
        amountKobo: fromLedgerKobo(row.amountKobo),
        automatic: row.isProxy,
        cancellationReason: row.lot.cancellationApprovals.length
          ? 'staff_cancelled'
          : (row.acceptance?.intent.bidRound ?? 0) < row.lot.bidRound
            ? 'reopened'
            : row.lot.purchases.length
              ? 'fixed_price'
              : undefined,
        outcome:
          row.lot.cancellationApprovals.length ||
          (row.acceptance?.intent.bidRound ?? 0) < row.lot.bidRound
            ? 'cancelled'
            : row.lot.purchases.length
              ? 'cancelled'
              : row.lot.settlement
                ? row.lot.settlement.winnerId === userId
                  ? 'won'
                  : 'lost'
                : 'pending',
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor:
        rows.length > limit && last
          ? next(last.id, last.createdAt, scope)
          : null,
    });
  }
  async invoices(
    userId: string,
    limit: number,
    cursor?: string,
    view: 'all' | 'purchases' | 'collections' = 'all',
  ) {
    const scope =
      view === 'all' ? `invoice:${userId}` : `invoice:${userId}:${view}`;
    const anchor = decode(cursor, scope);
    const rows = await this.db.invoice.findMany({
      where: {
        userId,
        ...(view === 'purchases' ? { purchase: { isNot: null } } : {}),
        ...(view === 'collections'
          ? {
              status: 'paid',
              fulfilment: {
                is: {
                  type: 'pickup',
                  status: { in: [...awaitingPickupStatuses] },
                  collectedAt: null,
                },
              },
            }
          : {}),
        ...(anchor
          ? {
              OR: [
                { createdAt: { lt: new Date(anchor.at) } },
                { createdAt: new Date(anchor.at), id: { lt: anchor.id } },
              ],
            }
          : {}),
      },
      select: invoiceSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return buyerInvoicePageSchema.parse({
      items: page.map((row) => ({
        ...money(row),
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor:
        rows.length > limit && last
          ? next(last.id, last.createdAt, scope)
          : null,
    });
  }
  async invoice(userId: string, id: string) {
    const row = await this.db.invoice.findFirst({
      where: { id, userId },
      select: {
        ...invoiceSelect,
        lines: { select: { lot: { select: lotSelect }, totalKobo: true } },
        fulfilment: {
          select: { status: true, location: { select: { name: true } } },
        },
      },
    });
    if (!row) throw new NotFoundException();
    const { fulfilment, lines, ...summary } = row;
    return buyerInvoiceDetailSchema.parse({
      ...money(summary),
      createdAt: row.createdAt.toISOString(),
      lines: lines.map((line) => ({
        lot: buyerLot(line.lot),
        totalKobo: fromLedgerKobo(line.totalKobo),
      })),
      pickup: fulfilment
        ? { location: fulfilment.location.name, status: fulfilment.status }
        : null,
    });
  }
}
