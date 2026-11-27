import { z } from 'zod';
import { twoFactorProofSchema } from './two-factor-schemas';

// Bids, pre-bids and Buy Now need the account owner to confirm it's them:
// password, an email code and the authenticator when it is turned on (owner
// decision 2026-11-26). After that the device stays unlocked for 30 minutes,
// and every bid or purchase restarts the 30 minutes.
export const PURCHASE_UNLOCK_MS = 30 * 60_000;
/** The error code returned when a bid or purchase needs the check first. */
export const PURCHASE_UNLOCK_REQUIRED = 'PURCHASE_UNLOCK_REQUIRED';

export const purchaseUnlockStartSchema = z
  .object({ password: z.string().min(1).max(200) })
  .strict();
export const purchaseUnlockChallengeSchema = z
  .object({
    id: z.uuid(),
    expiresAt: z.iso.datetime(),
    /** The buyer turned on an authenticator, so its code is needed too. */
    authenticator: z.boolean(),
  })
  .strict();
export const purchaseUnlockFinishSchema = z
  .object({
    id: z.uuid(),
    code: z.string().regex(/^\d{6}$/),
    factor: twoFactorProofSchema.optional(),
  })
  .strict();
export const purchaseUnlockStatusSchema = z
  .object({ unlockedUntil: z.iso.datetime().nullable() })
  .strict();
export type PurchaseUnlockStatus = z.infer<typeof purchaseUnlockStatusSchema>;
export type PurchaseUnlockChallenge = z.infer<
  typeof purchaseUnlockChallengeSchema
>;
