import { z } from 'zod';

export const buyerSessionRules = {
  idleMs: 15 * 60_000,
  warningMs: 60_000,
  activityIntervalMs: 15_000,
  checkIntervalMs: 30_000,
  activityUserLimit: 60,
  activityIpLimit: 240,
} as const;
export const buyerSessionStateSchema = z
  .object({
    serverTime: z.iso.datetime(),
    idleExpiresAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict();
export const buyerActivitySchema = z.object({}).strict();
export type BuyerSessionState = z.infer<typeof buyerSessionStateSchema>;
