import { z } from 'zod';
import { streamIdSchema } from '@auction-ng/shared';

// Projection boundary deliberately strips funding groups and private maxima.
const book = z.object({
  open: z.boolean(),
  startPriceKobo: z.number().int().safe().nonnegative(),
  currentPriceKobo: z.number().int().safe().nonnegative().nullable(),
  leader: z.object({ bidderId: z.uuid() }).nullable(),
  endsAt: z.number().int().safe().nonnegative(),
  startsAt: z.number().int().safe().nonnegative().optional(),
  streamId: streamIdSchema.optional().default('0-0'),
  pauseEndsAt: z.number().int().safe().nonnegative().optional(),
  pauseId: z.uuid().optional(),
  pausedAt: z.number().int().safe().nonnegative().optional(),
});
export function monitorBook(value: string | null) {
  return value === null ? null : book.parse(JSON.parse(value));
}
