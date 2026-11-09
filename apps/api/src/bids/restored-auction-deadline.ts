import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
export function applyRestoredDeadlines(
  initial: number,
  acceptedAt: number,
  plans: { oldEndAt: bigint; newEndAt: bigint; completedAt: Date | null }[],
) {
  if (!Number.isSafeInteger(initial) || !Number.isSafeInteger(acceptedAt))
    throw new ConflictException('Accepted deadline needs review.');
  let end = initial;
  for (const plan of plans) {
    if (
      plan.completedAt &&
      plan.completedAt.getTime() >= acceptedAt &&
      Number(plan.oldEndAt) === end
    ) {
      const next = Number(plan.newEndAt);
      if (!Number.isSafeInteger(next) || next < end)
        throw new ConflictException('Restored deadline needs review.');
      end = next;
    }
  }
  return end;
}
export async function restoredAuctionDeadline(
  db: Pick<Prisma.TransactionClient, '$queryRaw'>,
  namespace: string,
  lotId: string,
  initial: number,
  acceptedAt: number,
) {
  const plans = await db.$queryRaw<
    { oldEndAt: bigint; newEndAt: bigint; completedAt: Date }[]
  >`SELECT r.old_end_at AS "oldEndAt",r.new_end_at AS "newEndAt",r.completed_at AS "completedAt" FROM auction_resume_lots r JOIN auction_pause_commands c ON c.id=r.command_id WHERE c.namespace=${namespace} AND r.lot_id=${lotId}::uuid AND r.applied=true AND r.completed_at IS NOT NULL
    UNION ALL SELECT old_end_at,new_end_at,effective_at FROM lot_control_commands WHERE namespace=${namespace} AND lot_id=${lotId}::uuid AND status='completed' AND operation IN ('extend','resume') ORDER BY "completedAt"`;
  return applyRestoredDeadlines(initial, acceptedAt, plans);
}
