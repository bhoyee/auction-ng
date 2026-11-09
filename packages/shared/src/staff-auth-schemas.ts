import { z } from 'zod';
import { emailSchema } from './auth-session-schemas';
import { recoveryCodeSchema } from './two-factor-schemas';
export const staffRecoveryStartSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(128),
    deviceId: z.uuid(),
    client: z.literal('web'),
  })
  .strict();
export const staffRecoveryVerifySchema = z
  .object({
    challengeId: z.uuid(),
    code: z.string().regex(/^\d{6}$/),
    recoveryCode: recoveryCodeSchema,
    deviceId: z.uuid(),
    client: z.literal('web'),
  })
  .strict();
export const staffRoles = [
  'admin',
  'manager',
  'intake',
  'warehouse',
  'finance',
  'support',
] as const;
// Step 1 of staff sign-in: password, then an email code is sent.
export const staffSignInSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(128),
    deviceId: z.uuid(),
    client: z.literal('web'),
  })
  .strict();
export const staffSignInChallengeSchema = z
  .object({
    challengeId: z.uuid(),
    expiresInSeconds: z.number().int().positive(),
    twoFactorRequired: z.boolean(),
  })
  .strict();
export type StaffSignInChallenge = z.infer<typeof staffSignInChallengeSchema>;
// Step 2: the email code, plus the authenticator code when the account enabled 2FA.
export const staffSignInVerifySchema = z
  .object({
    challengeId: z.uuid(),
    code: z.string().regex(/^\d{6}$/),
    authenticatorCode: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    deviceId: z.uuid(),
    client: z.literal('web'),
  })
  .strict();
export const staffPasswordSchema = z.string().min(15).max(128);
