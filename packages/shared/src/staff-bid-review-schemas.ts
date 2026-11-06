import { z } from 'zod';
import { koboSchema } from './kobo-schema';
export const staffBidReviewQuerySchema = z
  .object({
    search: z.string().trim().max(120).default(''),
    status: z
      .enum(['all', 'open', 'scheduled', 'closed', 'cancelled'])
      .default('all'),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    cursor: z.uuid().optional(),
  })
  .strict();
export const staffBidReviewHistoryQuerySchema = z
  .object({
    search: z.string().trim().max(120).default(''),
    view: z.enum(['bids', 'prebids']).default('bids'),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    cursor: z.uuid().optional(),
  })
  .strict();
const buyer = z.object({ id: z.uuid(), name: z.string() }).strict();
export const staffBidReviewLotSchema = z
  .object({
    id: z.uuid(),
    reference: z.string(),
    title: z.string(),
    status: z.string(),
    condition: z.string(),
    category: z.string(),
    location: z.string(),
    startAt: z.iso.datetime(),
    endAt: z.iso.datetime(),
    archived: z.boolean(),
    startingPriceKobo: koboSchema,
    bidCount: z.number().int().nonnegative(),
    preBidCount: z.number().int().nonnegative(),
  })
  .strict();
export const staffBidReviewPageSchema = z
  .object({
    items: z.array(staffBidReviewLotSchema).max(50),
    nextCursor: z.uuid().nullable(),
  })
  .strict();
export const staffBidReviewDetailSchema = z
  .object({
    lot: staffBidReviewLotSchema,
    description: z.string(),
    retailPriceKobo: koboSchema,
    fixedPriceKobo: koboSchema.nullable(),
    round: z.number().int().nonnegative(),
    serverTime: z.iso.datetime(),
    lastRecordedAt: z.iso.datetime().nullable(),
    lastRecordedPriceKobo: koboSchema.nullable(),
    recordedLeader: buyer.nullable(),
    result: z
      .object({
        type: z.enum(['auction', 'buy_now', 'unsold', 'pending']),
        buyer: buyer.nullable(),
        priceKobo: koboSchema.nullable(),
        closedAt: z.iso.datetime().nullable(),
        status: z.string(),
        invoiceNumber: z.string().nullable(),
        invoiceStatus: z.string().nullable(),
      })
      .strict(),
    entries: z
      .array(
        z
          .object({
            id: z.uuid(),
            reference: z.string(),
            buyer,
            createdAt: z.iso.datetime(),
            updatedAt: z.iso.datetime().nullable(),
            kind: z.string(),
            status: z.string(),
            round: z.number().int().nonnegative().nullable(),
            publicPriceKobo: koboSchema.nullable(),
            directAmountKobo: koboSchema.nullable(),
          })
          .strict(),
      )
      .max(50),
    nextCursor: z.uuid().nullable(),
  })
  .strict();
export type StaffBidReviewQuery = z.input<typeof staffBidReviewQuerySchema>;
export type StaffBidReviewHistoryQuery = z.input<
  typeof staffBidReviewHistoryQuerySchema
>;
export type StaffBidReviewPage = z.infer<typeof staffBidReviewPageSchema>;
export type StaffBidReviewDetail = z.infer<typeof staffBidReviewDetailSchema>;
