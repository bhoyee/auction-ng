import { z } from 'zod';
export const walletControlsSchema = z
  .object({
    depositsEnabled: z.boolean(),
    withdrawalsEnabled: z.boolean(),
    revision: z.number().int().nonnegative().max(2147483646),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const walletControlsUpdateSchema = z
  .object({
    depositsEnabled: z.boolean(),
    withdrawalsEnabled: z.boolean(),
    expectedRevision: z.number().int().nonnegative().max(2147483645),
    reason: z.string().trim().min(5).max(240),
    idempotencyKey: z.uuid(),
  })
  .strict();
export type WalletControls = z.infer<typeof walletControlsSchema>;
export type WalletControlsUpdate = z.infer<typeof walletControlsUpdateSchema>;
