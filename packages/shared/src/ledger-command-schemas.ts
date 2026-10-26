import { z } from 'zod';

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
