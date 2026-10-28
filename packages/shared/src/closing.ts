import { z } from 'zod';
import { koboSchema } from './kobo-schema';

export const PAYMENT_GRACE_MS = 24 * 60 * 60 * 1000;
export const CLOSING_POLL_MS = 1000;
export const unsoldRelistRules = {
  durationMs: 24 * 60 * 60 * 1000,
  maxRetries: 2,
} as const;
export const closingSnapshotSchema = z
  .object({
    open: z.literal(false),
    startPriceKobo: koboSchema,
    currentPriceKobo: koboSchema.nullable(),
    leader: z
      .object({ bidderId: z.uuid(), maxKobo: koboSchema })
      .strict()
      .nullable(),
    groupId: z.uuid().nullable(),
    endsAt: z.number().int().safe().nonnegative(),
    closedAt: z.number().int().safe().nonnegative(),
    feeVersion: z.string().max(40),
    streamId: z
      .string()
      .regex(/^\d+-\d+$/)
      .default('0-0'),
    barrierId: z.string().regex(/^\d+-\d+$/),
    heldKobo: koboSchema.optional(),
  })
  .strict();
export type ClosingSnapshot = z.infer<typeof closingSnapshotSchema>;
export const closingReportSchema = z
  .object({
    checked: z.number().int().min(0).max(100),
    failed: z.number().int().min(0).max(100),
  })
  .strict();
export const pickupPassSchema = z
  .object({
    invoiceId: z.uuid(),
    fulfilmentId: z.uuid(),
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();
