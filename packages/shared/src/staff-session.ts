import { z } from 'zod';

export const staffSessionRules = {
  idleMs: 15 * 60_000,
  warningMs: 60_000,
  maximumMs: 8 * 60 * 60_000,
  activityIntervalMs: 15_000,
  checkIntervalMs: 30_000,
} as const;
export const staffSessionStateSchema = z
  .object({
    serverTime: z.iso.datetime(),
    idleExpiresAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict();
export type StaffSessionState = z.infer<typeof staffSessionStateSchema>;
export const staffActivitySchema = z.object({}).strict();
