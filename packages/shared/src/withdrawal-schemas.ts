import { z } from 'zod';
import { koboSchema } from './kobo-schema';
export const withdrawalIdSchema = z.uuid();
export const withdrawalProcessReportSchema = z
  .object({
    checked: z.number().int().min(0).max(10),
    failed: z.number().int().min(0).max(10),
  })
  .strict();
export const withdrawalStatusSchema = z.enum([
  'draft',
  'review',
  'queued',
  'processing',
  'pending',
  'success',
  'failed',
  'reversed',
  'rejected',
]);
export const withdrawalBankInputSchema = z
  .object({
    bankCode: z.string().regex(/^\d{2,9}$/),
    accountNumber: z.string().regex(/^\d{10}$/),
    bvn: z.string().regex(/^\d{11}$/),
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    consent: z.literal(true),
  })
  .strict();
export const withdrawalBankSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(['pending', 'verified', 'rejected']),
    bankName: z.string(),
    accountName: z.string(),
    accountLast4: z.string().regex(/^\d{4}$/),
  })
  .strict();
export const withdrawalQuoteInputSchema = z
  .object({ amountKobo: koboSchema })
  .strict();
export const withdrawalQuoteSchema = z
  .object({
    amountKobo: koboSchema,
    feeKobo: koboSchema,
    levyKobo: koboSchema,
    totalKobo: koboSchema,
  })
  .strict();
export const withdrawalStartSchema = z
  .object({
    bankId: z.uuid(),
    amountKobo: koboSchema,
    acceptedTotalKobo: koboSchema,
    password: z.string().min(1).max(128),
    idempotencyKey: z.uuid(),
  })
  .strict();
export const withdrawalConfirmSchema = z
  .object({ id: z.uuid(), code: z.string().regex(/^\d{6}$/) })
  .strict();
export const withdrawalSchema = withdrawalQuoteSchema
  .extend({
    id: z.uuid(),
    status: withdrawalStatusSchema,
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    reviewRequired: z.boolean(),
    settledFeeKobo: koboSchema.nullable(),
    returnedKobo: koboSchema.nullable(),
  })
  .strict();
export const withdrawalOverviewSchema = z
  .object({
    enabled: z.boolean(),
    automaticAvailableKobo: koboSchema,
    reviewAvailableKobo: koboSchema,
    minimumKobo: koboSchema,
    dailyLimitKobo: koboSchema,
    bank: withdrawalBankSchema.nullable(),
  })
  .strict();
export const withdrawalPageSchema = z
  .object({
    items: z.array(withdrawalSchema).max(50),
    nextCursor: z.string().nullable(),
  })
  .strict();
export const withdrawalReviewSchema = z
  .object({ approve: z.boolean(), reason: z.string().trim().min(5).max(300) })
  .strict();

export type WithdrawalBankInput = z.input<typeof withdrawalBankInputSchema>;
export type WithdrawalStartInput = z.input<typeof withdrawalStartSchema>;
export type WithdrawalConfirmInput = z.input<typeof withdrawalConfirmSchema>;
export type WithdrawalReviewInput = z.input<typeof withdrawalReviewSchema>;
