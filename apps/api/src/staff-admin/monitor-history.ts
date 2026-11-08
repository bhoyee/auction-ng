import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  monitorHistoryQuerySchema,
  monitorHistorySchema,
  maskMonitorName,
  fromLedgerKobo,
} from '@auction-ng/shared';
import type { AuthIdentity } from '../auth/auth-service';
import type { StaffAdminService } from './staff-admin-service';
import { encryptPii } from '../security/pii';
import { monitorLotDetailSchema } from '@auction-ng/shared';
export async function readMonitorLot(
  staff: StaffAdminService,
  who: AuthIdentity,
  id: string,
  input: unknown,
) {
  const query = monitorHistoryQuerySchema.parse(input);
  return staff.ledger.db.$transaction(async (tx) => {
    await staff.actor(tx, who, 'inventory.read');
    const lot = await tx.lot.findUnique({
      where: { id },
      include: {
        category: true,
        location: true,
        images: { orderBy: { sortOrder: 'asc' }, take: 20 },
      },
    });
    if (!lot) throw new NotFoundException();
    const creation = await tx.auditLog.findFirst({
      where: { entityId: id, entityType: 'lot', action: 'lots.created' },
      include: { actor: { select: { name: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const anchor = query.cursor
      ? await tx.auditLog.findFirst({
          where: { id: query.cursor, entityId: id, entityType: 'lot' },
          select: { id: true, createdAt: true },
        })
      : null;
    if (query.cursor && !anchor)
      throw new NotFoundException('Change-history page unavailable.');
    const changes = await tx.auditLog.findMany({
      where: {
        entityId: id,
        entityType: 'lot',
        ...(anchor
          ? {
              OR: [
                { createdAt: { lt: anchor.createdAt } },
                { createdAt: anchor.createdAt, id: { lt: anchor.id } },
              ],
            }
          : {}),
      },
      include: { actor: { select: { name: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 26,
    });
    return monitorLotDetailSchema.parse({
      id,
      reference: lot.lotNumber,
      title: lot.title,
      description: lot.description,
      createdAt: lot.createdAt.toISOString(),
      createdBy: creation?.actor?.name ?? null,
      condition: lot.condition,
      status: lot.status,
      category: lot.category.name,
      location: lot.location.name,
      startAt: lot.startAt.toISOString(),
      endAt: lot.endAt.toISOString(),
      runTimeMs:
        lot.originalRunTimeMs === null ? null : Number(lot.originalRunTimeMs),
      images: lot.images.map((i) => ({
        id: i.id,
        url: i.url,
        thumbnailUrl: i.thumbnailUrl,
      })),
      changes: changes.slice(0, 25).map((r) => ({
        id: r.id,
        action: r.action,
        at: r.createdAt.toISOString(),
        actor: r.actor?.name ?? 'Staff',
      })),
      nextCursor: changes.length > 25 ? changes[24]?.id : null,
      serverTime: new Date().toISOString(),
    });
  });
}

/** Permission and full-name audit commit before any protected response leaves the API. */
export async function readMonitorHistory(
  staff: StaffAdminService,
  who: AuthIdentity,
  id: string,
  input: unknown,
) {
  const query = monitorHistoryQuerySchema.parse(input);
  return staff.ledger.db.$transaction(async (tx) => {
    const access = await staff.actor(tx, who, 'auctions.manage');
    const lot = await tx.lot.findUnique({
      where: { id },
      select: { lotNumber: true, title: true },
    });
    if (!lot) throw new NotFoundException('Item not found.');
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
        ...(anchor
          ? {
              OR: [
                { createdAt: { lt: anchor.createdAt } },
                { createdAt: anchor.createdAt, id: { lt: anchor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: {
        id: true,
        amountKobo: true,
        isProxy: true,
        role: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    });
    const fullNames = access.user.role === 'admin';
    if (fullNames)
      await tx.auditLog.create({
        data: {
          actorId: who.user.id,
          action: 'live.bidder_names_viewed',
          entityType: 'lot',
          entityId: id,
          afterCiphertext: encryptPii(
            JSON.stringify({
              requestId: randomUUID(),
              cursor: query.cursor ?? null,
              bidIds: rows.slice(0, query.limit).map((r) => r.id),
            }),
            'audit',
          ),
        },
      });
    return monitorHistorySchema.parse({
      lotId: id,
      reference: lot.lotNumber,
      title: lot.title,
      fullNames,
      serverTime: new Date().toISOString(),
      items: rows.slice(0, query.limit).map((r) => ({
        id: r.id,
        bidder: fullNames
          ? (r.user.name ?? 'Buyer')
          : maskMonitorName(r.user.name ?? 'Buyer'),
        // Request rows for automatic limits are never public prices.
        amountKobo:
          r.isProxy && r.role !== 'counter'
            ? null
            : fromLedgerKobo(r.amountKobo),
        at: r.createdAt.toISOString(),
        kind:
          r.role === 'counter'
            ? 'counterbid'
            : r.isProxy
              ? 'automatic'
              : 'manual',
      })),
      nextCursor: rows.length > query.limit ? rows[query.limit - 1]?.id : null,
    });
  });
}
