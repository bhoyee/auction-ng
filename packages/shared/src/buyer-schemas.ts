import { z } from 'zod';
import { koboSchema } from './kobo-schema';
import { databaseValues } from './database-values';
export type BuyerBidPage = z.infer<typeof buyerBidPageSchema>;
export const buyerNotificationPageSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.uuid(),
            title: z.string(),
            href: z.literal('/invoices'),
            createdAt: z.iso.datetime(),
          })
          .strict(),
      )
      .max(50),
    nextCursor: z.string().nullable(),
  })
  .strict();
export const buyerResourceIdSchema = z.uuid();
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
  watchStatusInputSchema,
  watchStatusSchema,
} from './watch-status-schemas';
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
            outcome: z.enum(['pending', 'won', 'lost']),
            createdAt: z.iso.datetime(),
          })
          .strict(),
      )
      .max(50),
    nextCursor: z.string().nullable(),
  })
  .strict();
export const buyerInvoiceSchema = z
  .object({
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
      z.object({ lot: buyerLotSchema, totalKobo: koboSchema }).strict(),
    ),
    pickup: z
      .object({ location: z.string(), status: z.string() })
      .strict()
      .nullable(),
  })
  .strict();
