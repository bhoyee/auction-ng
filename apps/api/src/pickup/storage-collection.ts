import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { encryptPii } from '../security/pii';
import type { Prisma, PickupStorageCase } from '../generated/prisma/client';
import {
  pickupCalendarSchema,
  pickupStorageDays,
  calculateStorageCharge,
  fromLedgerKobo,
} from '@auction-ng/shared';
export function storageCaseCharge(row: PickupStorageCase, now: Date) {
  const at = row.collectedAt && row.collectedAt < now ? row.collectedAt : now;
  const days = pickupStorageDays(
    row.dueAt.toISOString(),
    at.toISOString(),
    pickupCalendarSchema.parse(row.calendar),
  );
  return {
    days,
    ...calculateStorageCharge({
      dailyKobo: fromLedgerKobo(row.dailyKobo),
      capKobo: fromLedgerKobo(row.capKobo),
      carriedKobo: fromLedgerKobo(row.carriedKobo),
      paidKobo: fromLedgerKobo(row.paidKobo),
      days,
      waived: row.waived,
    }),
  };
}
export async function confirmStorageCollection(
  tx: Prisma.TransactionClient,
  lineIds: string[],
  now: Date,
) {
  const cases = await tx.pickupStorageCase.findMany({
    where: { invoiceLineId: { in: lineIds } },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  for (const { id } of cases) {
    await tx.$queryRaw`SELECT id FROM pickup_storage_cases WHERE id=${id}::uuid FOR UPDATE`;
    const row = await tx.pickupStorageCase.findUniqueOrThrow({ where: { id } });
    if (row.collectedAt)
      throw new ConflictException(
        'Collection records need reconciliation before another handover.',
      );
    if (storageCaseCharge(row, now).outstandingKobo > 0)
      throw new ConflictException(
        'Storage charges must be paid or waived before these items can be collected.',
      );
    await tx.pickupStorageCase.update({
      where: { id },
      data: { collectedAt: now },
    });
  }
}

/**
 * A full refund cancels the pickup, so nothing more is owed for storage. New
 * terms make any open checkout fail; storage already paid is not returned.
 * The caller holds the invoice lock.
 */
export async function stopStorage(
  tx: Prisma.TransactionClient,
  invoiceId: string,
  actorId: string,
  invoiceNumber: string,
) {
  const cases = await tx.$queryRaw<{ id: string }[]>`
    SELECT c.id::text FROM pickup_storage_cases c
    JOIN invoice_lines l ON l.id = c.invoice_line_id
    WHERE l.invoice_id = ${invoiceId}::uuid AND c.collected_at IS NULL
    ORDER BY c.id FOR UPDATE OF c`;
  for (const { id } of cases) {
    await tx.pickupStoragePayment.updateMany({
      where: { caseId: id, status: 'pending', verifiedAt: null },
      data: { status: 'cancelled' },
    });
    await tx.pickupStorageCase.update({
      where: { id },
      data: {
        waived: true,
        revision: { increment: 1 },
        termsRevision: { increment: 1 },
      },
    });
    await tx.pickupStorageAdjustment.create({
      data: {
        requestKey: randomUUID(),
        caseId: id,
        actorId,
        action: 'waive',
        reasonCiphertext: encryptPii(
          `${invoiceNumber} was fully refunded`,
          'audit',
        ),
      },
    });
  }
}
