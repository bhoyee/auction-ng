import { z } from 'zod';
export const recoveryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-F0-9]{4}(?:-[A-F0-9]{4}){5}$/);
export const twoFactorProofSchema = z.discriminatedUnion('method', [
  z
    .object({
      method: z.literal('authenticator'),
      code: z.string().regex(/^\d{6}$/),
    })
    .strict(),
  z
    .object({ method: z.literal('recovery'), code: recoveryCodeSchema })
    .strict(),
]);
export type TwoFactorProof = z.infer<typeof twoFactorProofSchema>;
export const securityPurposeSchema = z.enum([
  'enable',
  'disable',
  'rotate',
  'recovery',
  'change-password',
]);
export const securityStartSchema = z
  .object({
    purpose: securityPurposeSchema,
    password: z.string().min(1).max(128),
    newPassword: z.string().min(12).max(128).optional(),
  })
  .strict()
  .refine(
    (v) => (v.purpose === 'change-password') === (v.newPassword !== undefined),
    'New password is required only for a password change.',
  );
export const securityEmailSchema = z
  .object({ id: z.uuid(), code: z.string().regex(/^\d{6}$/) })
  .strict();
export const securityFinishSchema = z
  .object({
    id: z.uuid(),
    factor: twoFactorProofSchema.optional(),
    newCode: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
  })
  .strict();
export const securityStatusSchema = z
  .object({
    enabled: z.boolean(),
    mandatory: z.boolean(),
    recoveryCodesRemaining: z.number().int().min(0).max(10),
  })
  .strict();
export const securityChallengeSchema = z
  .object({ id: z.uuid(), expiresAt: z.iso.datetime() })
  .strict();
export const securityEmailResultSchema = z
  .object({
    verified: z.literal(true),
    secret: z
      .string()
      .regex(/^[A-Z2-7]{32}$/)
      .optional(),
    uri: z.string().startsWith('otpauth://totp/').optional(),
  })
  .strict();
export const securityResultSchema = z
  .object({
    enabled: z.boolean(),
    recoveryCodes: z.array(recoveryCodeSchema).length(10).optional(),
  })
  .strict();
export const TWO_FACTOR_REQUIRED = 'TWO_FACTOR_REQUIRED';
export const TWO_FACTOR_INVALID = 'TWO_FACTOR_INVALID';
export type SecurityStart = z.input<typeof securityStartSchema>;
export type SecurityEmail = z.input<typeof securityEmailSchema>;
export type SecurityFinish = z.input<typeof securityFinishSchema>;
export type SecurityStatus = z.infer<typeof securityStatusSchema>;
export type SecurityEmailResult = z.infer<typeof securityEmailResultSchema>;
export type SecurityResult = z.infer<typeof securityResultSchema>;
