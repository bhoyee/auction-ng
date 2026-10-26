import { BadRequestException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import {
  buyerBidPageSchema,
  buyerNotificationPageSchema,
  buyerInvoicePageSchema,
  buyerInvoiceDetailSchema,
  watchPageSchema,
  catalogueRules,
  fromLedgerKobo,
} from '@auction-ng/shared';
import { createDatabase } from '../database/client';
import { bidHistoryPrice } from './bid-history';

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
  return {
    ...row,
    hammerTotalKobo: fromLedgerKobo(row.hammerTotalKobo),
    premiumKobo: fromLedgerKobo(row.premiumKobo),
    lotFeeKobo: fromLedgerKobo(row.lotFeeKobo),
    vatKobo: fromLedgerKobo(row.vatKobo),
    totalKobo: fromLedgerKobo(row.totalKobo),
  };
}
const invoiceSelect = {
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
  async notifications(userId: string, limit: number, cursor?: string) {
    const scope = `notifications:${userId}`;
    const anchor = decode(cursor, scope);
    const rows = await this.db.notification.findMany({
      where: {
        userId,
        template: 'auction-result-v1',
        ...(anchor
          ? {
              OR: [
                { createdAt: { lt: new Date(anchor.at) } },
                { createdAt: new Date(anchor.at), id: { lt: anchor.id } },
              ],
            }
          : {}),
      },
      select: { id: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return buyerNotificationPageSchema.parse({
      items: page.map((row) => ({
        id: row.id,
        title: 'Your auction result is ready',
        href: '/invoices',
        createdAt: row.createdAt.toISOString(),
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
  async bids(userId: string, limit: number, cursor?: string) {
    const scope = `bid:${userId}`;
    const anchor = decode(cursor, scope);
    const rows = await this.db.bid.findMany({
      where: {
        userId,
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
          select: { ...lotSelect, settlement: { select: { winnerId: true } } },
        },
        amountKobo: true,
        isProxy: true,
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
        outcome: row.lot.settlement
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
  async invoices(userId: string, limit: number, cursor?: string) {
    const scope = `invoice:${userId}`;
    const anchor = decode(cursor, scope);
    const rows = await this.db.invoice.findMany({
      where: {
        userId,
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
