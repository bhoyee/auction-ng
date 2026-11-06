import { NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import {
  acceptedBidEventSchema,
  fromLedgerKobo,
  staffBidReviewQuerySchema,
  staffBidReviewHistoryQuerySchema,
  staffBidReviewPageSchema,
  staffBidReviewDetailSchema,
} from '@auction-ng/shared';
import type { Prisma } from '../generated/prisma/client';
import type { AuthIdentity } from '../auth/auth-service';
import { StaffAdminService } from './staff-admin-service';
const person = { select: { id: true, name: true } } as const;
const lotInclude = {
  category: { select: { name: true } },
  location: { select: { name: true } },
  _count: {
    select: {
      bids: { where: { OR: [{ role: 'request' }, { role: null }] } },
      preBids: true,
    },
  },
} satisfies Prisma.LotInclude;
type Lot = Prisma.LotGetPayload<{ include: typeof lotInclude }>;
const lotView = (lot: Lot) => ({
  id: lot.id,
  reference: lot.lotNumber,
  title: lot.title,
  status: lot.status,
  condition: lot.condition,
  category: lot.category.name,
  location: lot.location.name,
  startAt: lot.startAt.toISOString(),
  endAt: lot.endAt.toISOString(),
  archived: !!lot.archivedAt,
  startingPriceKobo: fromLedgerKobo(lot.startPriceKobo),
  bidCount: lot._count.bids,
  preBidCount: lot._count.preBids,
});
const earlier = (at: Date, id: string) => ({
  OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: id } }],
});
function publicEvent(value: unknown) {
  const parsed = acceptedBidEventSchema.safeParse(value);
  return parsed.success
    ? {
        price: parsed.data.state.currentPriceKobo,
        leaderId: parsed.data.state.leader.bidderId,
      }
    : null;
}
export class StaffBidReviewService {
  constructor(private readonly staff: StaffAdminService) {}
  async list(who: AuthIdentity, input: unknown) {
    const query = staffBidReviewQuerySchema.parse(input);
    return this.staff.ledger.db.$transaction(async (tx) => {
      await this.staff.actor(tx, who, 'bids.read');
      const anchor = query.cursor
        ? await tx.lot.findUnique({
            where: { id: query.cursor },
            select: { id: true, createdAt: true },
          })
        : null;
      if (query.cursor && !anchor)
        throw new NotFoundException('Auction page unavailable.');
      const userId = z.uuid().safeParse(query.search);
      const rows = await tx.lot.findMany({
        where: {
          ...(query.status !== 'all'
            ? {
                status:
                  query.status === 'open'
                    ? { in: ['open', 'closing'] }
                    : query.status,
              }
            : {}),
          AND: [
            ...(anchor ? [earlier(anchor.createdAt, anchor.id)] : []),
            ...(query.search
              ? [
                  {
                    OR: [
                      {
                        title: {
                          contains: query.search,
                          mode: 'insensitive' as const,
                        },
                      },
                      {
                        lotNumber: {
                          contains: query.search,
                          mode: 'insensitive' as const,
                        },
                      },
                      ...(userId.success ? [{ id: userId.data }] : []),
                      {
                        bids: {
                          some: {
                            user: {
                              name: {
                                contains: query.search,
                                mode: 'insensitive' as const,
                              },
                            },
                          },
                        },
                      },
                      ...(userId.success
                        ? [
                            { bids: { some: { userId: userId.data } } },
                            { preBids: { some: { userId: userId.data } } },
                          ]
                        : []),
                      {
                        preBids: {
                          some: {
                            user: {
                              name: {
                                contains: query.search,
                                mode: 'insensitive' as const,
                              },
                            },
                          },
                        },
                      },
                    ],
                  },
                ]
              : []),
          ],
        },
        include: lotInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
      });
      return staffBidReviewPageSchema.parse({
        items: rows.slice(0, query.limit).map(lotView),
        nextCursor:
          rows.length > query.limit
            ? (rows[query.limit - 1]?.id ?? null)
            : null,
      });
    });
  }
  async detail(who: AuthIdentity, id: string, input: unknown) {
    const query = staffBidReviewHistoryQuerySchema.parse(input);
    return this.staff.ledger.db.$transaction(async (tx) => {
      await this.staff.actor(tx, who, 'bids.read');
      const lot = await tx.lot.findUnique({
        where: { id },
        include: {
          ...lotInclude,
          settlement: {
            select: {
              status: true,
              winner: person,
              hammerKobo: true,
              closedAt: true,
              invoice: { select: { number: true, status: true } },
            },
          },
          purchases: {
            where: { status: 'paid' },
            take: 1,
            select: {
              user: person,
              priceKobo: true,
              verifiedAt: true,
              invoice: { select: { number: true, status: true } },
            },
          },
        },
      });
      if (!lot) throw new NotFoundException('Item not found.');
      const latest = await tx.bid.findFirst({
        where: {
          lotId: id,
          acceptance: { intent: { bidRound: lot.bidRound } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { createdAt: true, acceptance: { select: { result: true } } },
      });
      const event = publicEvent(latest?.acceptance?.result);
      const leader = event
        ? await tx.user.findUnique({
            where: { id: event.leaderId },
            select: { id: true, name: true },
          })
        : null;
      const searchUser = query.search
        ? {
            OR: [
              {
                user: {
                  name: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
              },
              ...(z.uuid().safeParse(query.search).success
                ? [{ userId: query.search }]
                : []),
            ],
          }
        : {};
      const entries = [];
      let nextCursor: string | null = null;
      if (query.view === 'bids') {
        const anchor = query.cursor
          ? await tx.bid.findFirst({
              where: { id: query.cursor, lotId: id },
              select: { id: true, createdAt: true },
            })
          : null;
        if (query.cursor && !anchor)
          throw new NotFoundException('Bid page unavailable.');
        const rows = await tx.bid.findMany({
          where: {
            lotId: id,
            AND: [
              searchUser,
              ...(anchor ? [earlier(anchor.createdAt, anchor.id)] : []),
            ],
          },
          select: {
            id: true,
            user: person,
            createdAt: true,
            isProxy: true,
            role: true,
            amountKobo: true,
            acceptanceId: true,
            acceptance: {
              select: { result: true, intent: { select: { bidRound: true } } },
            },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: query.limit + 1,
        });
        for (const row of rows.slice(0, query.limit))
          entries.push({
            id: row.id,
            reference: row.acceptanceId ?? row.id,
            buyer: row.user,
            createdAt: row.createdAt.toISOString(),
            updatedAt: null,
            kind:
              row.role === 'counter'
                ? 'Automatic counterbid'
                : row.isProxy
                  ? 'Automatic bid'
                  : 'Full amount bid',
            status: 'accepted',
            round: row.acceptance?.intent.bidRound ?? null,
            publicPriceKobo:
              publicEvent(row.acceptance?.result)?.price ??
              (!row.isProxy ? fromLedgerKobo(row.amountKobo) : null),
            directAmountKobo: !row.isProxy
              ? fromLedgerKobo(row.amountKobo)
              : null,
          });
        if (rows.length > query.limit)
          nextCursor = rows[query.limit - 1]?.id ?? null;
      } else {
        const anchor = query.cursor
          ? await tx.preBid.findFirst({
              where: { id: query.cursor, lotId: id },
              select: { id: true, createdAt: true },
            })
          : null;
        if (query.cursor && !anchor)
          throw new NotFoundException('Pre-bid page unavailable.');
        const rows = await tx.preBid.findMany({
          where: {
            lotId: id,
            AND: [
              searchUser,
              ...(anchor ? [earlier(anchor.createdAt, anchor.id)] : []),
            ],
          },
          select: {
            id: true,
            user: person,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: query.limit + 1,
        });
        for (const row of rows.slice(0, query.limit))
          entries.push({
            id: row.id,
            reference: row.id,
            buyer: row.user,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            kind: 'Private pre-bid',
            status: row.status,
            round: null,
            publicPriceKobo: null,
            directAmountKobo: null,
          });
        if (rows.length > query.limit)
          nextCursor = rows[query.limit - 1]?.id ?? null;
      }
      const purchase = lot.purchases[0],
        settlement = lot.settlement;
      const result = purchase
        ? {
            type: 'buy_now',
            buyer: purchase.user,
            priceKobo: fromLedgerKobo(purchase.priceKobo),
            closedAt: purchase.verifiedAt?.toISOString() ?? null,
            status: 'paid',
            invoiceNumber: purchase.invoice?.number ?? null,
            invoiceStatus: purchase.invoice?.status ?? null,
          }
        : settlement
          ? {
              type: settlement.winner ? 'auction' : 'unsold',
              buyer: settlement.winner,
              priceKobo:
                settlement.hammerKobo === null
                  ? null
                  : fromLedgerKobo(settlement.hammerKobo),
              closedAt: settlement.closedAt.toISOString(),
              status: settlement.status,
              invoiceNumber: settlement.invoice?.number ?? null,
              invoiceStatus: settlement.invoice?.status ?? null,
            }
          : {
              type: 'pending',
              buyer: null,
              priceKobo: null,
              closedAt: null,
              status: lot.status,
              invoiceNumber: null,
              invoiceStatus: null,
            };
      return staffBidReviewDetailSchema.parse({
        lot: lotView(lot),
        description: lot.description,
        retailPriceKobo: fromLedgerKobo(lot.retailPriceKobo),
        fixedPriceKobo:
          lot.fixedPriceKobo === null
            ? null
            : fromLedgerKobo(lot.fixedPriceKobo),
        round: lot.bidRound,
        serverTime: new Date().toISOString(),
        lastRecordedAt: latest?.createdAt.toISOString() ?? null,
        lastRecordedPriceKobo: event?.price ?? null,
        recordedLeader: leader,
        result,
        entries,
        nextCursor,
      });
    });
  }
  async opened(who: AuthIdentity, id: string, key: string) {
    return this.staff.mutation(
      who,
      {
        idempotencyKey: key,
        reason: 'Staff inspected auction bid history',
        id,
      },
      'bids.read',
      'bid_review_opened',
      async (tx) => {
        const lot = await tx.lot.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!lot) throw new NotFoundException();
        return { id, message: 'Bid review recorded.' };
      },
    );
  }
}
