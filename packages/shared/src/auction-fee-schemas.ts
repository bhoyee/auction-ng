import { z } from 'zod';
import { koboSchema } from './kobo-schema';
export const auctionFeeConfigSchema = z
  .object({
    serviceChargeEnabled: z.boolean(),
    premiumBps: z.number().int().min(0).max(10000),
    lotFeeEnabled: z.boolean(),
    lotFeeKobo: koboSchema,
    vatEnabled: z.boolean(),
    vatBps: z.number().int().min(0).max(10000),
  })
  .strict();
export const auctionFeePolicySchema = auctionFeeConfigSchema
  .extend({ version: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/) })
  .strict();
export const auctionFeeSettingsSchema = z
  .object({
    policy: auctionFeePolicySchema,
    revision: z.number().int().min(0).max(2147483646),
    applied: z.boolean(),
  })
  .strict();
export const auctionFeeQuoteSchema = z
  .object({ policy: auctionFeePolicySchema, locked: z.boolean() })
  .strict();
export const auctionFeeUpdateSchema = auctionFeeConfigSchema
  .extend({
    expectedRevision: z.number().int().min(0).max(2147483645),
    idempotencyKey: z.uuid(),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();
export const auctionFeeChangedSchema = z
  .object({ revision: z.number().int().nonnegative() })
  .strict();
export type AuctionFeePolicy = z.infer<typeof auctionFeePolicySchema>;
export type AuctionFeeSettings = z.infer<typeof auctionFeeSettingsSchema>;
export type AuctionFeeQuote = z.infer<typeof auctionFeeQuoteSchema>;
export type AuctionFeeUpdate = z.infer<typeof auctionFeeUpdateSchema>;
