import { z } from 'zod';
import { koboSchema } from './kobo-schema';
const stream = z.string().regex(/^\d+-\d+$/);
export const bidCancellationApprovalSchema = z
  .object({
    expectedStreamId: stream,
    expectedFeeKobo: koboSchema,
    reason: z.string().trim().min(10).max(500),
    idempotencyKey: z.uuid(),
  })
  .strict();
export const bidCancellationQuoteSchema = z
  .object({
    conversationId: z.uuid(),
    lotId: z.uuid(),
    lotNumber: z.string(),
    buyerName: z.string(),
    priceKobo: koboSchema,
    premiumBps: z.number().int().min(0).max(10000),
    feeKobo: koboSchema,
    streamId: stream,
    isLeader: z.boolean(),
    status: z.enum(['available', 'processing', 'completed', 'failed']),
    endsAt: z.iso.datetime(),
  })
  .strict();
export const bidCancellationApprovalResultSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(['pending', 'committed', 'completed', 'failed']),
    feeKobo: koboSchema,
    reopened: z.boolean(),
  })
  .strict();
export type BidCancellationApprovalInput = z.infer<
  typeof bidCancellationApprovalSchema
>;
