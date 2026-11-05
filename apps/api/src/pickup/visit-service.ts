import { requireStaffPermission } from '../auth/staff-access';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import { LedgerService } from '../ledger/ledger-service';
import { decryptPii, encryptPii, hashPii } from '../security/pii';
import {
  awaitingPickupStatuses,
  PICKUP_PASS_TTL_MS,
  pickupVisitSchema,
  pickupVisitPassSchema,
  collectionReceiptSchema,
  type CollectionInput,
} from '@auction-ng/shared';

const visitInclude = {
  buyer: { select: { name: true } },
  location: true,
} as const;
const passInclude = {
  location: true,
  visit: { include: visitInclude },
} as const;
type Visit = Prisma.PickupVisitGetPayload<{ include: typeof visitInclude }>;
type Pass = Prisma.PickupVisitPassGetPayload<{ include: typeof passInclude }>;
type Tx = Prisma.TransactionClient;
const eligibility = {
  type: 'pickup',
  status: { in: [...awaitingPickupStatuses] },
  collectedAt: null,
};
const visitView = (v: Visit) =>
  pickupVisitSchema.parse({
    id: v.id,
    buyerName: v.buyer.name,
    locationId: v.locationId,
    location: v.location.name,
    status: v.status,
    createdAt: v.createdAt.toISOString(),
    finishedAt: v.finishedAt?.toISOString() ?? null,
  });
const receiptView = (
  r: Prisma.PickupCollectionReceiptGetPayload<{ include: { items: true } }>,
) =>
  collectionReceiptSchema.parse({
    id: r.id,
    visitId: r.visitId,
    lineIds: r.items.map((i) => i.invoiceLineId).sort(),
    finishVisit: r.finishVisit,
    createdAt: r.createdAt.toISOString(),
  });
const uuids = (ids: string[]) =>
  Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));

export class VisitService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private passView(p: Pass) {
    return pickupVisitPassSchema.parse({
      id: p.id,
      token: decryptPii(Buffer.from(p.tokenCiphertext), 'pickup-visit-token'),
      code: decryptPii(Buffer.from(p.codeCiphertext), 'pickup-visit-code'),
      expiresAt: p.expiresAt.toISOString(),
      serverTime: this.now().toISOString(),
      location: {
        id: p.location.id,
        name: p.location.name,
        address: p.location.address,
      },
      visit: p.visit ? visitView(p.visit) : null,
    });
  }
  private async staff(tx: Tx, id: string) {
    await requireStaffPermission(tx, id, 'pickup.manage');
  }
  private async audit(
    tx: Tx,
    actorId: string,
    action: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ) {
    await tx.auditLog.create({
      data: {
        actorId,
        action,
        entityType: 'pickup_visit',
        entityId,
        beforeCiphertext: encryptPii(JSON.stringify(before), 'audit'),
        afterCiphertext: encryptPii(JSON.stringify(after), 'audit'),
      },
    });
  }
  async centres(userId: string, limit: number, cursor?: string) {
    const where = {
      userId,
      ...eligibility,
      invoice: { status: 'paid', lines: { some: { collection: null } } },
    };
    const rows = await this.ledger.db.location.findMany({
      where: {
        fulfilments: { some: where },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: {
        id: true,
        name: true,
        address: true,
        _count: { select: { fulfilments: { where } } },
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    return {
      items: rows.slice(0, limit).map((r) => ({
        id: r.id,
        name: r.name,
        address: r.address,
        orderCount: r._count.fulfilments,
      })),
      nextCursor: rows.length > limit ? (rows[limit - 1]?.id ?? null) : null,
    };
  }
  async prepare(userId: string, locationId: string, renew = false) {
    return this.ledger.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`visit:${userId}:${locationId}`},0))::text`;
      const existing = await tx.pickupVisitPass.findUnique({
        where: { userId_locationId: { userId, locationId } },
        include: passInclude,
      });
      const active = await tx.pickupVisit.findFirst({
        where: { userId, locationId, status: 'waiting' },
        include: visitInclude,
      });
      if (existing && active && existing.visitId !== active.id)
        return this.passView(
          await tx.pickupVisitPass.update({
            where: { id: existing.id },
            data: { visitId: active.id },
            include: passInclude,
          }),
        );
      if (
        existing &&
        (active ||
          (!renew && (existing.visit || existing.expiresAt > this.now())))
      )
        return this.passView(existing);
      const order = await tx.fulfilment.findFirst({
        where: {
          userId,
          locationId,
          ...eligibility,
          invoice: { status: 'paid', lines: { some: { collection: null } } },
        },
      });
      if (!order && !active)
        throw new NotFoundException(
          'No paid items are awaiting pickup at this centre.',
        );
      const token = 'ANGP1_' + randomBytes(32).toString('base64url'),
        alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
        code = Array.from(
          randomBytes(8),
          (b) => alphabet[b % alphabet.length],
        ).join('');
      const data = {
        tokenHash: hashPii(token, 'pickup-visit-token'),
        tokenCiphertext: encryptPii(token, 'pickup-visit-token'),
        codeHash: hashPii(code, 'pickup-visit-code'),
        codeCiphertext: encryptPii(code, 'pickup-visit-code'),
        expiresAt: new Date(this.now().getTime() + PICKUP_PASS_TTL_MS),
        visitId: active?.id ?? null,
      };
      return this.passView(
        await tx.pickupVisitPass.upsert({
          where: { userId_locationId: { userId, locationId } },
          create: { userId, locationId, ...data },
          update: data,
          include: passInclude,
        }),
      );
    });
  }
  async pass(userId: string, id: string) {
    const row = await this.ledger.db.pickupVisitPass.findFirst({
      where: { id, userId },
      include: passInclude,
    });
    if (!row) throw new NotFoundException();
    return this.passView(row);
  }
  async scan(actorId: string, input: string) {
    return this.ledger.db.$transaction(async (tx) => {
      await this.staff(tx, actorId);
      const code = input.replace(/\s+/g, ''),
        where =
          code.length === 8
            ? { codeHash: hashPii(code.toUpperCase(), 'pickup-visit-code') }
            : { tokenHash: hashPii(code, 'pickup-visit-token') };
      const candidate = await tx.pickupVisitPass.findUnique({
        where,
        include: passInclude,
      });
      if (!candidate)
        throw new NotFoundException(
          'Pass not recognised. Ask the buyer for a fresh pass.',
        );
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`visit:${candidate.userId}:${candidate.locationId}`},0))::text`;
      const pass = await tx.pickupVisitPass.findUnique({
        where,
        include: passInclude,
      });
      if (!pass)
        throw new ConflictException(
          'This pass was replaced. Scan the current pass.',
        );
      if (pass.visit) return visitView(pass.visit);
      if (pass.expiresAt <= this.now())
        throw new ConflictException(
          'Pass expired. Ask the buyer to refresh their pass.',
        );
      const eligible = await tx.fulfilment.findFirst({
        where: {
          userId: pass.userId,
          locationId: pass.locationId,
          ...eligibility,
          invoice: { status: 'paid', lines: { some: { collection: null } } },
        },
      });
      if (!eligible)
        throw new ConflictException(
          'No paid items are available for collection.',
        );
      const active = await tx.pickupVisit.findFirst({
        where: {
          userId: pass.userId,
          locationId: pass.locationId,
          status: 'waiting',
        },
        include: visitInclude,
      });
      const visit =
        active ??
        (await tx.pickupVisit.create({
          data: {
            userId: pass.userId,
            locationId: pass.locationId,
            registeredById: actorId,
          },
          include: visitInclude,
        }));
      await tx.pickupVisitPass.update({
        where: { id: pass.id },
        data: { visitId: visit.id },
      });
      await this.audit(tx, actorId, 'pickup.visit.scan', visit.id, null, {
        status: visit.status,
      });
      return visitView(visit);
    });
  }
  async queue(limit: number, cursor?: string) {
    const anchor = cursor
      ? await this.ledger.db.pickupVisit.findUnique({ where: { id: cursor } })
      : null;
    if (cursor && !anchor)
      throw new NotFoundException('Queue page unavailable.');
    const rows = await this.ledger.db.pickupVisit.findMany({
      where: {
        status: 'waiting',
        ...(anchor
          ? {
              OR: [
                { createdAt: { gt: anchor.createdAt } },
                { createdAt: anchor.createdAt, id: { gt: anchor.id } },
              ],
            }
          : {}),
      },
      include: visitInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });
    return {
      items: rows.slice(0, limit).map(visitView),
      nextCursor: rows.length > limit ? (rows[limit - 1]?.id ?? null) : null,
    };
  }
  async items(
    actorId: string,
    id: string,
    limit: number,
    cursor?: string,
    itemNumber?: string,
  ) {
    await this.staff(this.ledger.db, actorId);
    const visit = await this.ledger.db.pickupVisit.findUnique({
      where: { id },
      include: visitInclude,
    });
    if (!visit) throw new NotFoundException();
    const rows = await this.ledger.db.invoiceLine.findMany({
      where: {
        collection: null,
        ...(itemNumber ? { lot: { lotNumber: itemNumber } } : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
        invoice: {
          userId: visit.userId,
          status: 'paid',
          fulfilment: { is: { locationId: visit.locationId, ...eligibility } },
        },
      },
      include: {
        lot: { select: { id: true, lotNumber: true, title: true } },
        invoice: { select: { number: true } },
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    return {
      visit: visitView(visit),
      items: rows.slice(0, limit).map((r) => ({
        id: r.id,
        lotId: r.lotId,
        itemNumber: r.lot.lotNumber,
        title: r.lot.title,
        invoiceNumber: r.invoice.number,
      })),
      nextCursor: rows.length > limit ? (rows[limit - 1]?.id ?? null) : null,
    };
  }
  async collect(actorId: string, visitId: string, input: CollectionInput) {
    return this.ledger.db.$transaction(
      async (tx) => {
        await this.staff(tx, actorId);
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`pickup-receipt:${input.idempotencyKey}`},0))::text`;
        const previous = await tx.pickupCollectionReceipt.findUnique({
          where: { id: input.idempotencyKey },
          include: { items: true },
        });
        if (previous) {
          if (
            previous.staffId !== actorId ||
            previous.visitId !== visitId ||
            previous.finishVisit !== input.finishVisit ||
            JSON.stringify(
              previous.items.map((i) => i.invoiceLineId).sort(),
            ) !== JSON.stringify([...input.lineIds].sort())
          )
            throw new ConflictException(
              'This confirmation key belongs to a different collection.',
            );
          return receiptView(previous);
        }
        await tx.$queryRaw`SELECT id FROM pickup_visits WHERE id=${visitId}::uuid FOR UPDATE`;
        const visit = await tx.pickupVisit.findUnique({
          where: { id: visitId },
        });
        if (!visit || visit.status !== 'waiting')
          throw new ConflictException(
            'This visit is no longer open. Refresh the queue.',
          );
        const requested = await tx.invoiceLine.findMany({
          where: { id: { in: input.lineIds } },
          select: { id: true, invoiceId: true },
        });
        if (requested.length !== input.lineIds.length)
          throw new NotFoundException('One or more items are unavailable.');
        const invoiceIds = [
          ...new Set(requested.map((r) => r.invoiceId)),
        ].sort();
        // Match invoice/fulfilment lock order used elsewhere, then recheck paid ownership.
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM invoices WHERE id IN (${uuids(invoiceIds)}) ORDER BY id FOR UPDATE`,
        );
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM fulfilments WHERE invoice_id IN (${uuids(invoiceIds)}) ORDER BY id FOR UPDATE`,
        );
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM invoice_lines WHERE id IN (${uuids(input.lineIds)}) ORDER BY id FOR UPDATE`,
        );
        const valid = await tx.invoiceLine.count({
          where: {
            id: { in: input.lineIds },
            collection: null,
            invoice: {
              userId: visit.userId,
              status: 'paid',
              fulfilment: {
                is: { locationId: visit.locationId, ...eligibility },
              },
            },
          },
        });
        if (valid !== input.lineIds.length)
          throw new ConflictException(
            'Items changed, were collected already or are not part of this buyer’s pickup. Refresh before confirming.',
          );
        const receipt = await tx.pickupCollectionReceipt.create({
          data: {
            id: input.idempotencyKey,
            visitId,
            staffId: actorId,
            finishVisit: input.finishVisit,
            items: {
              create: input.lineIds.map((invoiceLineId) => ({ invoiceLineId })),
            },
          },
          include: { items: true },
        });
        const remaining = await tx.invoiceLine.groupBy({
          by: ['invoiceId'],
          where: { invoiceId: { in: invoiceIds }, collection: null },
        });
        const stillOpen = new Set(remaining.map((r) => r.invoiceId)),
          complete = invoiceIds.filter((id) => !stillOpen.has(id));
        if (complete.length)
          await tx.fulfilment.updateMany({
            where: {
              invoiceId: { in: complete },
              userId: visit.userId,
              locationId: visit.locationId,
              ...eligibility,
            },
            data: { status: 'collected', collectedAt: this.now() },
          });
        if (input.finishVisit)
          await tx.pickupVisit.update({
            where: { id: visitId },
            data: { status: 'completed', finishedAt: this.now() },
          });
        await this.audit(
          tx,
          actorId,
          'pickup.visit.collect',
          visitId,
          { status: 'waiting' },
          {
            receiptId: receipt.id,
            lineIds: input.lineIds,
            completedInvoiceIds: complete,
            finishVisit: input.finishVisit,
          },
        );
        return receiptView(receipt);
      },
      { timeout: 15000 },
    );
  }
  async cancel(actorId: string, id: string, reason: string) {
    return this.ledger.db.$transaction(async (tx) => {
      await this.staff(tx, actorId);
      await tx.$queryRaw`SELECT id FROM pickup_visits WHERE id=${id}::uuid FOR UPDATE`;
      const row = await tx.pickupVisit.findUnique({
        where: { id },
        include: visitInclude,
      });
      if (!row) throw new NotFoundException();
      if (row.status === 'cancelled') return visitView(row);
      if (row.status !== 'waiting')
        throw new ConflictException('This visit is already complete.');
      const result = await tx.pickupVisit.update({
        where: { id },
        data: { status: 'cancelled', finishedAt: this.now() },
        include: visitInclude,
      });
      await this.audit(
        tx,
        actorId,
        'pickup.visit.cancel',
        id,
        { status: row.status },
        { status: result.status, reason },
      );
      return visitView(result);
    });
  }
}
