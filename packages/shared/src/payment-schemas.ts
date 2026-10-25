import { z } from 'zod';
import { koboSchema } from './schemas';
import { normalizeNigerianPhone } from './auth-schemas';

export const topupQuoteInputSchema = z
  .object({ transferKobo: koboSchema.refine((value) => value > 0) })
  .strict();
export const topupQuoteSchema = z
  .object({
    transferKobo: koboSchema,
    feeKobo: koboSchema,
    creditKobo: koboSchema,
    currency: z.literal('NGN'),
    feePolicy: z.literal('paystack-dva-v1'),
  })
  .strict();
export const virtualAccountInputSchema = z
  .object({
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    phone: z
      .string()
      .max(32)
      .transform((value, ctx) => {
        try {
          return normalizeNigerianPhone(value);
        } catch {
          ctx.addIssue({
            code: 'custom',
            message: 'Enter a valid Nigerian phone number.',
          });
          return z.NEVER;
        }
      }),
    bvn: z.string().regex(/^\d{11}$/),
    bankCode: z.string().regex(/^\d{3,6}$/),
    accountNumber: z.string().regex(/^\d{10}$/),
    consent: z.literal(true),
    feePolicy: z.literal('paystack-dva-v1'),
  })
  .strict();
export const virtualAccountSchema = z
  .object({
    bankName: z.string(),
    accountNumber: z.string().regex(/^\d{10}$/),
    currency: z.literal('NGN'),
    testMode: z.literal(true),
  })
  .strict();
export const virtualAccountResultSchema = z.union([
  virtualAccountSchema,
  z.object({ status: z.enum(['pending', 'not_requested']) }).strict(),
]);
export type VirtualAccountInput = z.infer<typeof virtualAccountInputSchema>;
export const paymentHistorySchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.uuid(),
            transferKobo: koboSchema,
            feeKobo: koboSchema,
            creditKobo: koboSchema,
            status: z.enum(['pending', 'verified', 'credited', 'failed']),
            createdAt: z.iso.datetime(),
          })
          .strict(),
      )
      .max(50),
    nextCursor: z.string().nullable(),
  })
  .strict();
