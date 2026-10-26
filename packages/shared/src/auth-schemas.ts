import { z } from 'zod';
import {
  emailSchema,
  webRefreshSchema,
  profileSchema,
  tokenResponseSchema,
} from './auth-session-schemas';
export {
  emailSchema,
  profileSchema,
  tokenResponseSchema,
} from './auth-session-schemas';
export function normalizeNigerianPhone(input: string): string {
  const compact = input.replace(/[\s()-]/g, '');
  const phone = /^0[789]\d{9}$/.test(compact)
    ? `+234${compact.slice(1)}`
    : compact;
  if (!/^\+234[789]\d{9}$/.test(phone))
    throw new RangeError(
      'Enter a Nigerian mobile number, for example 0803 123 4567.',
    );
  return phone;
}
const device = { deviceId: z.uuid(), client: z.enum(['web', 'mobile']) };
export const requestCodeSchema = z
  .object({ email: emailSchema, ...device })
  .strict();
export const verifyCodeSchema = z
  .object({
    challengeId: z.uuid(),
    code: z.string().regex(/^\d{6}$/),
    ...device,
  })
  .strict();
export const refreshSchema = z.discriminatedUnion('client', [
  webRefreshSchema,
  z
    .object({
      client: z.literal('mobile'),
      deviceId: z.uuid(),
      refreshToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    })
    .strict(),
]);
export const profilePatchSchema = z
  .object({ name: z.string().trim().min(1).max(120) })
  .strict();
export const codeRequestedSchema = z
  .object({
    challengeId: z.uuid(),
    expiresInSeconds: z.number().int().positive(),
    message: z.string(),
  })
  .strict();
export type RequestCodeInput = z.infer<typeof requestCodeSchema>;
export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type TokenResponse = z.infer<typeof tokenResponseSchema>;
