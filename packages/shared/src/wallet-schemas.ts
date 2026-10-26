import { z } from 'zod';
import { databaseValues } from './database-values';
import { koboSchema } from './kobo-schema';
import { walletBalanceSchema } from './wallet-balance-schema';
export { walletBalanceSchema } from './wallet-balance-schema';

export * from './ledger-command-schemas';

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
