import { z } from 'zod';
import { koboSchema } from './kobo-schema';
// Bid-cancellation request/state schemas, split from support-schemas so the
// item page can check and request a cancellation without bundling the whole
// customer-service chat schema set. support-schemas re-exports everything here.
export const LIVE_BID_COMMITMENT_NOTICE =
  'Accepted bids cannot be cancelled. Reserved funds are released when you’re outbid.';
export const bidCancellationRequestSchema = z
  .object({
    reason: z.string().trim().min(10).max(1000),
    acknowledged: z.literal(true),
    feeAcknowledged: z.literal(true),
    idempotencyKey: z.uuid(),
  })
  .strict();
export type BidCancellationRequestInput = z.input<
  typeof bidCancellationRequestSchema
>;
export const supportTopics = [
  'bidding',
  'payments',
  'wallet',
  'withdrawals',
  'pickup',
  'condition',
  'account',
  'other',
] as const;
export const supportStatusSchema = z.enum(['open', 'in_progress', 'resolved']);
export const supportTopicSchema = z.enum(supportTopics);
export const supportConversationSchema = z
  .object({
    id: z.uuid(),
    number: z.string(),
    subject: z.string(),
    topic: supportTopicSchema,
    reference: z.string(),
    status: supportStatusSchema,
    mode: z.enum(['assistant', 'human']),
    version: z.number().int(),
    buyerName: z.string(),
    assigneeName: z.string().nullable(),
    assignedToMe: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const bidCancellationStateSchema = z
  .object({
    commitment: z
      .object({
        maxKobo: koboSchema,
        automatic: z.boolean(),
        createdAt: z.iso.datetime(),
      })
      .strict()
      .nullable(),
    canRequest: z.boolean(),
    blocked: z.boolean().default(false),
    feeBps: z.number().int().min(0).max(10000).default(0),
    feeConsent: z.boolean().default(false),
    conversation: supportConversationSchema.nullable(),
  })
  .strict();
