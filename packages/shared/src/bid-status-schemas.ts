import * as z from 'zod';

/**
 * The signed-in buyer's own position on displayed lots, for the status pill
 * on item photos (owner decision 2026-11-22). Display only: it never feeds
 * bidding or money decisions.
 */
export const bidStatusInputSchema = z
  .object({ lotIds: z.array(z.uuid()).min(1).max(50) })
  .strict();
export const bidStatusStates = ['bidding', 'won', 'lost'] as const;
export const bidStatusSchema = z
  .object({
    items: z
      .array(
        z.object({ lotId: z.uuid(), state: z.enum(bidStatusStates) }).strict(),
      )
      .max(50),
  })
  .strict();
export type BidStatusState = (typeof bidStatusStates)[number];
export { cardBidStatus, type CardBidStatus } from './card-bid-status';
