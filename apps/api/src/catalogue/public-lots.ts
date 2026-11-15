import type { databaseValues } from '@auction-ng/shared';
import type { Prisma } from '../generated/prisma/client';

type LotStatus = (typeof databaseValues.lotStatuses)[number];

/**
 * A finished draft shown in Upcoming as "Coming soon, date to be announced"
 * (owner decision 2026-11-14). Buyers may view and watch it; it is never
 * scheduled, so pre-bids, bids and Buy Now keep refusing it. Use this only
 * where buyers read or watch lots, never on a money or bid path.
 */
export const comingSoonLot = {
  status: 'draft',
  comingSoonAt: { not: null },
  archivedAt: null,
  deletedAt: null,
} satisfies Prisma.LotWhereInput;

/** Lots with one of these statuses, or a coming-soon draft. */
export function visibleLot(
  statuses: readonly LotStatus[],
): Prisma.LotWhereInput {
  return { OR: [{ status: { in: [...statuses] } }, comingSoonLot] };
}
