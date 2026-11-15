import { z } from 'zod';
import { koboSchema } from './kobo-schema';
import { RELIST_MAX_PRICE_CUT_PERCENT } from './auction-rules';
import { pageCursorSchema } from './page-schemas';

// Unsold relists (owner decisions 2026-11-13). Admins set how many automatic
// relists an item gets, how long each runs and an optional price cut; staff
// with "lots.relist" relist the rest by hand from Unsold review.
export const RELIST_MAX_RETRIES = 5;
export const RELIST_MAX_RUN_HOURS = 168;
const runHours = z.number().int().min(1).max(RELIST_MAX_RUN_HOURS);

export const relistSettingsSchema = z
  .object({
    maxRetries: z.number().int().min(0).max(RELIST_MAX_RETRIES),
    runHours,
    priceCutPercent: z.number().int().min(0).max(RELIST_MAX_PRICE_CUT_PERCENT),
    revision: z.number().int().nonnegative().max(2147483646),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const relistSettingsUpdateSchema = relistSettingsSchema
  .omit({ revision: true, updatedAt: true })
  .extend({
    expectedRevision: z.number().int().nonnegative().max(2147483645),
    reason: z.string().trim().min(5).max(240),
    idempotencyKey: z.uuid(),
  })
  .strict();
export type RelistSettings = z.infer<typeof relistSettingsSchema>;
export type RelistSettingsUpdate = z.infer<typeof relistSettingsUpdateSchema>;

export const unsoldListInputSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: pageCursorSchema,
  })
  .strict();
export const unsoldLotSchema = z
  .object({
    id: z.uuid(),
    lotNumber: z.string(),
    title: z.string(),
    imageUrl: z.string().nullable(),
    startPriceKobo: koboSchema,
    fixedPriceKobo: koboSchema.nullable(),
    retailPriceKobo: koboSchema,
    autoRelistCount: z.number().int().min(0),
    closedAt: z.iso.datetime(),
    locationName: z.string(),
    binCode: z.string().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const unsoldPageSchema = z
  .object({
    items: z.array(unsoldLotSchema).max(50),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative(),
    settings: relistSettingsSchema,
  })
  .strict();
export const unsoldCountSchema = z
  .object({ count: z.number().int().nonnegative() })
  .strict();

// A manual relist: staff may change this lot's prices; startsAt null = now.
export const unsoldRelistSchema = z
  .object({
    startPriceKobo: koboSchema.refine((v) => v > 0, 'Enter a starting price.'),
    fixedPriceKobo: koboSchema
      .refine((v) => v > 0, 'Enter a fixed price above ₦0.')
      .nullable(),
    startsAt: z.iso.datetime().nullable(),
    runHours,
    expectedUpdatedAt: z.iso.datetime(),
    idempotencyKey: z.uuid(),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();
export const unsoldRelistResultSchema = z
  .object({
    lotId: z.uuid(),
    lotNumber: z.string(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    message: z.string(),
  })
  .strict();
export type UnsoldLot = z.infer<typeof unsoldLotSchema>;
export type UnsoldPage = z.infer<typeof unsoldPageSchema>;
export type UnsoldRelistInput = z.infer<typeof unsoldRelistSchema>;
export type UnsoldRelistResult = z.infer<typeof unsoldRelistResultSchema>;
