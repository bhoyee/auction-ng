import { BATCH_RESTORE_DAYS } from '@auction-ng/shared';
import type { createDatabase } from '../database/client';
import { encryptPii } from '../security/pii';
import { lockRecalculation } from './batch-recalc';

type Db = ReturnType<typeof createDatabase>;
/** Internal scheduled maintenance only; audit history is never removed. */
export async function purgeDeletedBatches(db: Db, limit = 25) {
  const cutoff = new Date(Date.now() - BATCH_RESTORE_DAYS * 86400_000);
  const candidates = await db.batch.findMany({
    where: { deletedAt: { lte: cutoff } },
    orderBy: [{ deletedAt: 'asc' }, { id: 'asc' }],
    take: Math.min(50, Math.max(1, limit)),
    select: { id: true },
  });
  let removed = 0;
  for (const { id } of candidates) {
    removed += await db.$transaction(async (tx) => {
      await lockRecalculation(tx);
      const locked = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM batches WHERE id=${id}::uuid AND deleted_at <= ${cutoff} FOR UPDATE SKIP LOCKED`;
      if (!locked.length) return 0;
      const batch = await tx.batch.findUniqueOrThrow({
        where: { id },
        include: {
          categories: true,
          attachments: {
            select: { id: true, name: true, bytes: true, createdById: true },
          },
        },
      });
      if (
        batch.status !== 'arriving' ||
        batch.receivedOn ||
        batch.itemsReceived !== null ||
        batch.stockLinkedAt ||
        (await tx.lot.count({ where: { batchId: id } })) ||
        (await tx.lotCost.count({ where: { batchId: id } }))
      )
        return 0;
      await tx.auditLog.create({
        data: {
          actorId: null,
          action: 'batches.purged',
          entityType: 'batch',
          entityId: id,
          beforeCiphertext: encryptPii(
            JSON.stringify(batch, (_, value: unknown) =>
              typeof value === 'bigint' ? value.toString() : value,
            ),
            'audit',
          ),
          afterCiphertext: encryptPii(
            JSON.stringify({
              reason: 'Unused deleted batch retention expired',
              retentionDays: BATCH_RESTORE_DAYS,
            }),
            'audit',
          ),
        },
      });
      await tx.batchAttachment.deleteMany({ where: { batchId: id } });
      await tx.staffActivityEvent.create({
        data: {
          sourceKey: `workspace.changed:batch:purged:${id}`,
          kind: 'workspace.changed',
          entityId: id,
        },
      });
      await tx.$executeRaw`SELECT set_config('giddydeal.batch_purge','on',true)`;
      await tx.batch.delete({ where: { id } });
      return 1;
    });
  }
  return { removed };
}
