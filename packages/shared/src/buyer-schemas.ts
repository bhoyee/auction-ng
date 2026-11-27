export {
  buyerNotificationPageSchema,
  buyerNotificationSummarySchema,
  buyerNotificationReadInputSchema,
  buyerNotificationReadResultSchema,
} from './buyer-notification-schemas';
import { z } from 'zod';
import { preBidSchema } from './prebid-schemas';
import { koboSchema } from './kobo-schema';
import { databaseValues } from './database-values';
export * from './watch-activity-schemas';
export * from './foreground-messages';
export type BuyerBidPage = z.infer<typeof buyerBidPageSchema>;
export const awaitingPickupStatuses = ['pending', 'booked', 'ready'] as const;

export const buyerResourceIdSchema = z.uuid();

/** Estimated retail savings on paid items, never below zero per item. */
export const buyerSavingsSchema = z
  .object({
    savedKobo: koboSchema,
    paidItems: z.number().int().nonnegative().safe(),
  })
  .strict();
export type BuyerSavings = z.infer<typeof buyerSavingsSchema>;

export const lotBidHistorySchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.uuid(),
            currentPriceKobo: koboSchema,
            bidderLabel: z.string().regex(/^Buyer [A-F0-9]{6}$/),
            createdAt: z.iso.datetime(),
          })
          .strict(),
      )
      .max(50),
    nextCursor: z.string().nullable(),
  })
  .strict();
export type LotBidHistory = z.infer<typeof lotBidHistorySchema>;

export const buyerLotSchema = z
  .object({
    id: z.uuid(),
    lotNumber: z.string(),
    title: z.string(),
    status: z.enum(databaseValues.lotStatuses),
    thumbnailUrl: z.url().nullable().optional(),
    locationName: z.string().optional(),
  })
  .strict();
export {
  watchInputSchema,
  watchCountSchema,
  watchStatusInputSchema,
  watchStatusSchema,
} from './watch-status-schemas';
export {
  bidStatusInputSchema,
  bidStatusSchema,
  bidStatusStates,
  cardBidStatus,
  type BidStatusState,
  type CardBidStatus,
} from './bid-status-schemas';
export const watchPageSchema = z
  .object({
    items: z
      .array(
        z.object({ lot: buyerLotSchema, createdAt: z.iso.datetime() }).strict(),
      )
      .max(50),
    nextCursor: z.string().nullable(),
  })
  .strict();
export const buyerBidPageSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.uuid(),
            lot: buyerLotSchema,
            amountKobo: koboSchema,
            automatic: z.boolean(),
            outcome: z.enum(['pending', 'won', 'lost', 'cancelled']),
            cancellationReason: z
              .enum(['staff_cancelled', 'reopened', 'fixed_price'])
              .optional(),
            createdAt: z.iso.datetime(),
          })
          .strict(),
      )
      .max(50),
    nextCursor: z.string().nullable(),
  })
  .strict();
export const buyerPreBidPageSchema = z
  .object({
    items: z
      .array(
        preBidSchema
          .extend({
            lot: buyerLotSchema,
            reservedKobo: koboSchema,
          })
          .strict(),
      )
      .max(50),
    nextCursor: z.string().nullable(),
    serverTime: z.iso.datetime(),
  })
  .strict();
export type BuyerPreBidPage = z.infer<typeof buyerPreBidPageSchema>;
export const buyerInvoiceSchema = z
  .object({
    saleType: z.enum(['auction', 'fixed_price']).default('auction'),
    id: z.uuid(),
    number: z.string(),
    status: z.enum(databaseValues.invoiceStatuses),
    hammerTotalKobo: koboSchema,
    premiumKobo: koboSchema,
    lotFeeKobo: koboSchema,
    vatKobo: koboSchema,
    totalKobo: koboSchema,
    createdAt: z.iso.datetime(),
  })
  .strict();
export const buyerInvoicePageSchema = z
  .object({
    items: z.array(buyerInvoiceSchema).max(50),
    nextCursor: z.string().nullable(),
  })
  .strict();
export const buyerInvoiceDetailSchema = buyerInvoiceSchema
  .extend({
    lines: z.array(
      z
        .object({
          lot: buyerLotSchema,
          totalKobo: koboSchema,
          storage: z
            .object({
              dueAt: z.iso.datetime(),
              dailyKobo: koboSchema,
              capKobo: koboSchema,
              outstandingKobo: koboSchema,
              waived: z.boolean(),
            })
            .strict()
            .nullable()
            .optional(),
        })
        .strict(),
    ),
    pickup: z
      .object({ location: z.string(), status: z.string() })
      .strict()
      .nullable(),
  })
  .strict();
