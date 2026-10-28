import { z } from 'zod';
import { emailSchema } from './auth-session-schemas';
export const staffRoles = [
  'admin',
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
