import { requireStaffPermission } from '../auth/staff-access';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { LedgerService } from '../ledger/ledger-service';
import { encryptPii } from '../security/pii';
import { awaitingPickupStatuses } from '@auction-ng/shared';
import {
  arrivalSchema,
  arrivalInputSchema,
  arrivalUpdateSchema,
} from '@auction-ng/shared';
import type { Prisma } from '../generated/prisma/client';
import type { z } from 'zod';

const active = ['waiting', 'acknowledged'];
const include = {
  buyer: { select: { name: true } },
  fulfilment: { include: { invoice: true, location: true } },
} as const;
type Row = Prisma.PickupArrivalGetPayload<{ include: typeof include }>;
const eligible = {
  type: 'pickup',
  status: { in: [...awaitingPickupStatuses] },
  collectedAt: null,
  invoice: { status: 'paid' },
};
function view(row: Row) {
  return arrivalSchema.parse({
    id: row.id,
    invoiceId: row.fulfilment.invoiceId,
    invoiceNumber: row.fulfilment.invoice.number,
    buyerName: row.buyer.name,
    location: row.fulfilment.location.name,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
export class ArrivalService {
  constructor(private readonly ledger: LedgerService) {}
  async checkIn(userId: string, input: z.infer<typeof arrivalInputSchema>) {
    return this.ledger.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`pickup-request:${userId}:${input.idempotencyKey}`},0))::text`;
      // Serialise retries and different keys for this order before checking eligibility.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`pickup:${input.invoiceId}`},0))::text`;
      const previous = await tx.pickupArrival.findUnique({
        where: {
          userId_requestKey: { userId, requestKey: input.idempotencyKey },
        },
        include,
      });
      if (previous) {
        if (previous.fulfilment.invoiceId !== input.invoiceId)
          throw new ConflictException(
            'This request belongs to a different order.',
          );
        return view(previous);
      }
      await tx.$queryRaw`SELECT id FROM invoices WHERE id=${input.invoiceId}::uuid FOR UPDATE`;
      const fulfilment = await tx.fulfilment.findFirst({
        where: { invoiceId: input.invoiceId, userId },
      });
      if (!fulfilment) throw new NotFoundException('Pickup order unavailable.');
      await tx.$queryRaw`SELECT id FROM fulfilments WHERE id=${fulfilment.id}::uuid FOR UPDATE`;
      const valid = await tx.fulfilment.findFirst({
        where: { id: fulfilment.id, userId, ...eligible },
      });
      if (!valid)
        throw new ConflictException(
          'Only paid, uncollected pickup orders can check in.',
        );
      const existing = await tx.pickupArrival.findFirst({
        where: { fulfilmentId: valid.id, status: { in: active } },
        include,
      });
      if (existing)
        throw new ConflictException(
          'This order already has an active check-in. Refresh your arrivals.',
        );
      return view(
        await tx.pickupArrival.create({
          data: {
            fulfilmentId: valid.id,
            userId,
            requestKey: input.idempotencyKey,
          },
          include,
        }),
      );
    });
  }
  async list(userId: string | undefined, limit: number, cursor?: string) {
    const scope = userId ? { userId } : {};
    const anchor = cursor
      ? await this.ledger.db.pickupArrival.findFirst({
          where: { id: cursor, ...scope },
        })
      : null;
    if (cursor && !anchor) throw new NotFoundException('Page unavailable.');
    const rows = await this.ledger.db.pickupArrival.findMany({
      where: {
        ...scope,
        status: { in: active },
        fulfilment: eligible,
        ...(anchor
          ? {
              OR: [
                { createdAt: { gt: anchor.createdAt } },
                { createdAt: anchor.createdAt, id: { gt: anchor.id } },
              ],
            }
          : {}),
      },
      include,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });
    const items = rows.slice(0, limit);
    return {
      items: items.map(view),
      nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null,
    };
  }
  async update(
    actorId: string,
    id: string,
    input: z.infer<typeof arrivalUpdateSchema>,
  ) {
    return this.ledger.db.$transaction(async (tx) => {
      await requireStaffPermission(tx, actorId, 'pickup.manage');
      await tx.$queryRaw`SELECT id FROM pickup_arrivals WHERE id=${id}::uuid FOR UPDATE`;
      const row = await tx.pickupArrival.findUnique({ where: { id }, include });
      if (!row) throw new NotFoundException();
      if (row.status === input.status) return view(row);
      if (
        row.status !== input.expectedStatus ||
        (input.status === 'acknowledged'
          ? row.status !== 'waiting'
          : row.status !== 'acknowledged')
      )
        throw new ConflictException(
          'This visit changed. Refresh the queue before trying again.',
        );
      const updated = await tx.pickupArrival.update({
        where: { id },
        data: { status: input.status, handledById: actorId },
        include,
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: `pickup.arrival.${input.status}`,
          entityType: 'pickup_arrival',
          entityId: id,
          beforeCiphertext: encryptPii(
            JSON.stringify({ status: row.status }),
            'audit',
          ),
          afterCiphertext: encryptPii(
            JSON.stringify({ status: updated.status }),
            'audit',
          ),
        },
      });
      return view(updated);
    });
  }
}
