import * as z from 'zod';
import { userSchema } from './user-schema';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254));
export const webRefreshSchema = z
  .object({ client: z.literal('web'), deviceId: z.uuid() })
  .strict();
export const profileSchema = userSchema
  .extend({
    email: emailSchema,
    emailVerified: z.boolean(),
    phone: z.string().nullable(),
  })
  .strict();
export const tokenResponseSchema = z
  .object({
    accessToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    expiresInSeconds: z.number().int().positive(),
    refreshToken: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .optional(),
    user: profileSchema,
  })
  .strict();
export type TokenResponse = z.infer<typeof tokenResponseSchema>;
