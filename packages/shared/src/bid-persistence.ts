import { z } from 'zod';
import { bidModeSchema } from './bid-schemas';
import { streamIdSchema } from './stream-id-schema';
export { streamIdSchema } from './stream-id-schema';
export const BID_STREAM_GROUP = 'postgres-v1';
export const BID_STREAM_NAMESPACE = 'auction:bids:v1:';
export const BID_PERSISTENCE_MS = 1000;
export const BID_RECLAIM_MS = 1000;
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const acceptedBidEventSchema = z
  .object({
    status: z.literal('accepted'),
    mode: bidModeSchema.default('automatic'),
    isLeader: z.boolean(),
    state: z
      .object({
        startPriceKobo: money.positive(),
        currentPriceKobo: money.positive(),
        leader: z
          .object({ bidderId: z.uuid(), maxKobo: money.positive() })
          .strict(),
        endsAt: money,
      })
      .strict(),
    serverTime: money,
  })
  .strict();
export const persistBidsSchema = z
  .object({
    streamIds: z
      .array(streamIdSchema)
      .max(50)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .strict();
export const persistedBidsSchema = z
  .object({
    namespace: z.string().regex(/^[a-zA-Z0-9:_-]{1,160}$/),
    persisted: z.array(streamIdSchema).max(50),
  })
  .strict();
