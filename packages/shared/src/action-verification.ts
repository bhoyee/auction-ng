import { z } from 'zod';
import { twoFactorProofSchema } from './two-factor-schemas';

// Owner-approved 2026-11-09: password + email code (+ authenticator when enabled)
// before buyer money actions. Bidding stays unlocked for a short window so a
// buyer is not blocked by email delivery during a soft-close bidding war.
export const actionPurposes = [
  'bidding',
  'buy-now',
  'bid-cancellation',
] as const;
export type ActionPurpose = (typeof actionPurposes)[number];
export const actionPurposeSchema = z.enum(actionPurposes);

export const BIDDING_VERIFICATION_MS = 30 * 60 * 1000;
export const ACTION_VERIFICATION_TTL_MS = 10 * 60 * 1000;
export const ACTION_CODE_TTL_MS = 5 * 60 * 1000;

export const actionVerifyStartSchema = z
  .object({
    purpose: actionPurposeSchema,
    password: z.string().min(1).max(128),
    lotId: z.uuid().optional(),
  })
  .strict()
  .refine(
    (v) => (v.purpose === 'bidding') === (v.lotId === undefined),
    'A lot is required for Buy Now and cancellation checks only.',
  );
export type ActionVerifyStartInput = z.input<typeof actionVerifyStartSchema>;

export const actionVerifyChallengeSchema = z
  .object({
    id: z.uuid(),
    expiresAt: z.iso.datetime(),
    twoFactorRequired: z.boolean(),
  })
  .strict();
export type ActionVerifyChallenge = z.infer<typeof actionVerifyChallengeSchema>;

export const actionVerifyFinishSchema = z
  .object({
    id: z.uuid(),
    code: z.string().regex(/^\d{6}$/),
    factor: twoFactorProofSchema.optional(),
  })
  .strict();
export type ActionVerifyFinishInput = z.input<typeof actionVerifyFinishSchema>;

export const actionVerifyResultSchema = z
  .object({
    purpose: actionPurposeSchema,
    // Single-use proof for Buy Now and cancellation; absent for bidding.
    verificationId: z.uuid().nullable(),
    // When the bidding window closes; absent for single-use checks.
    biddingVerifiedUntil: z.iso.datetime().nullable(),
    expiresAt: z.iso.datetime(),
  })
  .strict();
export type ActionVerifyResult = z.infer<typeof actionVerifyResultSchema>;

export const actionVerifyStatusSchema = z
  .object({ biddingVerifiedUntil: z.iso.datetime().nullable() })
  .strict();
export type ActionVerifyStatus = z.infer<typeof actionVerifyStatusSchema>;

export const VERIFICATION_REQUIRED = 'VERIFICATION_REQUIRED';
