import { z } from 'zod';
import { databaseValues } from './database-values';
import { koboSchema } from './kobo-schema';
import { walletSchema } from './wallet-schema';

const identifier = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9:._-]+$/);
const amount = z.bigint().positive().max(BigInt(Number.MAX_SAFE_INTEGER));
const base = {
  walletId: z.uuid(),
  idempotencyKey: identifier,
  reference: identifier,
};
const amountInput = { ...base, amountKobo: amount };
export const ledgerCommandSchema = z.discriminatedUnion('operation', [
  z.object({ ...amountInput, operation: z.literal('topup') }).strict(),
  z.object({ ...amountInput, operation: z.literal('debit') }).strict(),
  z.object({ ...amountInput, operation: z.literal('payout') }).strict(),
  z
    .object({ ...amountInput, operation: z.literal('hold'), holdId: z.uuid() })
    .strict(),
  z
    .object({
      ...amountInput,
      operation: z.literal('capture'),
      holdId: z.uuid(),
    })
    .strict(),
  z
    .object({ ...base, operation: z.literal('release'), holdId: z.uuid() })
    .strict(),
  z
    .object({
      ...amountInput,
      operation: z.literal('refund'),
      sourceTransactionId: z.uuid(),
    })
    .strict(),
]);
export type LedgerCommand = z.infer<typeof ledgerCommandSchema>;
export type LedgerAmountInput = z.infer<z.ZodObject<typeof amountInput>>;
export type LedgerHoldInput = LedgerAmountInput & { holdId: string };
export type LedgerReleaseInput = z.infer<z.ZodObject<typeof base>> & {
  holdId: string;
};
export type LedgerRefundInput = LedgerAmountInput & {
  sourceTransactionId: string;
};
export const walletBalanceSchema = walletSchema
  .extend({ totalKobo: koboSchema })
  .strict();
export const walletHistoryItemSchema = z
  .object({
    id: z.uuid(),
    operation: z.enum(databaseValues.walletOperations),
    amountKobo: koboSchema,
    availableDeltaKobo: z.number().refine(Number.isSafeInteger),
    heldDeltaKobo: z.number().refine(Number.isSafeInteger),
    holdId: z.uuid().nullable(),
    sourceTransactionId: z.uuid().nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const walletHistorySchema = z
  .object({
    items: z.array(walletHistoryItemSchema).max(50),
    nextCursor: z.string().max(512).nullable(),
  })
  .strict();
export const walletHistoryInputSchema = z
  .object({
    limit: z.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict();
export const walletHistoryQuerySchema = z
  .object({
    limit: z
      .string()
      .regex(/^(?:[1-9]|[1-4]\d|50)$/)
      .transform(Number)
      .optional(),
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict();
export const walletCursorSchema = z
  .object({ id: z.uuid(), createdAt: z.iso.datetime() })
  .strict();
export type WalletBalance = z.infer<typeof walletBalanceSchema>;
export type WalletHistory = z.infer<typeof walletHistorySchema>;
export type WalletHistoryInput = z.input<typeof walletHistoryInputSchema>;
