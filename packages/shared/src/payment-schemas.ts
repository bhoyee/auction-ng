import { z } from 'zod';
import { koboSchema } from './kobo-schema';
import { normalizeNigerianPhone } from './auth-schemas';
export const paymentBankCodeSchema = z.string().regex(/^[A-Za-z0-9]{3,20}$/);
export const paymentBankPageSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(160),
            code: paymentBankCodeSchema,
          })
          .strict(),
      )
      .max(50),
    nextCursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,2048}$/)
      .nullable(),
  })
  .strict();
export type PaymentBankPage = z.infer<typeof paymentBankPageSchema>;

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
    bankCode: paymentBankCodeSchema,
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
            fundingMethod: z.enum([
              'bank_transfer',
              'card',
              'checkout_transfer',
            ]),
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

export const cardQuoteInputSchema = z
  .object({
    amountKobo: koboSchema.refine((value) => value > 0),
    cardType: z.enum(['local', 'international']),
  })
  .strict();
export const cardQuoteSchema = cardQuoteInputSchema
  .extend({
    feeKobo: koboSchema,
    creditKobo: koboSchema,
    currency: z.literal('NGN'),
    feePolicy: z.enum([
      'paystack-card-local-v1',
      'paystack-card-international-v1',
    ]),
  })
  .strict();
export const cardFundingInputSchema = cardQuoteInputSchema
  .extend({
    feePolicy: cardQuoteSchema.shape.feePolicy,
    acceptedFeeKobo: koboSchema,
    acceptedCreditKobo: koboSchema,
    consent: z.literal(true),
    idempotencyKey: z.uuid(),
  })
  .strict();
export const cardCheckoutSchema = cardQuoteSchema
  .extend({ paymentId: z.uuid(), authorizationUrl: z.url() })
  .strict();
export const cardConfirmInputSchema = z
  .object({ paymentId: z.uuid() })
  .strict();
export const cardConfirmationSchema = z
  .object({
    paymentId: z.uuid(),
    status: z.enum(['pending', 'credited', 'failed']),
  })
  .strict();
export type CardFundingInput = z.infer<typeof cardFundingInputSchema>;
export const transferQuoteInputSchema = z
  .object({ amountKobo: koboSchema.refine((value) => value > 0) })
  .strict();
export const transferQuoteSchema = transferQuoteInputSchema
  .extend({
    feeKobo: koboSchema,
    creditKobo: koboSchema,
    currency: z.literal('NGN'),
    feePolicy: z.literal('paystack-transfer-v1'),
  })
  .strict();
export const transferFundingInputSchema = transferQuoteInputSchema
  .extend({
    feePolicy: z.literal('paystack-transfer-v1'),
    acceptedFeeKobo: koboSchema,
    acceptedCreditKobo: koboSchema,
    consent: z.literal(true),
    idempotencyKey: z.uuid(),
  })
  .strict();
export const transferCheckoutSchema = transferQuoteSchema
  .extend({ paymentId: z.uuid(), authorizationUrl: z.url() })
  .strict();
export type TransferFundingInput = z.infer<typeof transferFundingInputSchema>;
export const fundingRefundInputSchema = z
  .object({
    paymentId: z.uuid(),
    amountKobo: koboSchema.refine((value) => value > 0),
    reason: z.string().trim().min(1).max(500),
    idempotencyKey: z.uuid(),
  })
  .strict();
export const fundingRefundSchema = z
  .object({
    requestId: z.uuid(),
    paymentId: z.uuid(),
    amountKobo: koboSchema,
    status: z.literal('requested'),
    message: z.literal(
      'Refund requested for review. Funds stay in your wallet until approval.',
    ),
  })
  .strict();
export type FundingRefundInput = z.infer<typeof fundingRefundInputSchema>;
