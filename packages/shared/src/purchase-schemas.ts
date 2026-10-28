import { z } from 'zod';
import { koboSchema } from './kobo-schema';
export const PURCHASE_RESERVATION_MS = 10 * 60 * 1000;
export const purchaseMethodSchema = z.enum([
  'wallet',
  'local_card',
  'international_card',
  'bank_transfer',
]);
export const purchaseInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    method: purchaseMethodSchema,
    acceptedPriceKobo: koboSchema,
    acceptedTaxKobo: koboSchema,
    acceptedProcessingFeeKobo: koboSchema,
    acceptedTotalKobo: koboSchema,
  })
  .strict();
export const purchaseStatusSchema = z
  .object({
    id: z.uuid(),
    lotId: z.uuid(),
    method: purchaseMethodSchema,
    status: z.enum(['pending', 'paid', 'expired', 'cancelled']),
    priceKobo: koboSchema,
    taxKobo: koboSchema,
    totalKobo: koboSchema,
    amountKobo: koboSchema,
    processingFeeKobo: koboSchema,
    expiresAt: z.iso.datetime(),
    invoiceId: z.uuid().nullable(),
    authorizationUrl: z.url().nullable(),
    fundsCredited: z.boolean(),
  })
  .strict();
export const fixedPriceEditSchema = z
  .object({
    fixedPriceKobo: koboSchema.refine((v) => v > 0).nullable(),
    expectedUpdatedAt: z.iso.datetime(),
  })
  .strict();
export type PurchaseInput = z.infer<typeof purchaseInputSchema>;
export type PurchaseStatus = z.infer<typeof purchaseStatusSchema>;
