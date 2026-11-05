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
export const staffSignInSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(128),
    code: z.string().regex(/^\d{6}$/),
    deviceId: z.uuid(),
    client: z.literal('web'),
  })
  .strict();
export const staffPasswordSchema = z.string().min(15).max(128);
