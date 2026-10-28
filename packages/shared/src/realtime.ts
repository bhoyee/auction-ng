import * as z from 'zod';
import { streamIdSchema } from './stream-id-schema';
export const REALTIME_HEARTBEAT_MS = 5000;
export const REALTIME_STALE_MS = 12000;
export const REALTIME_MAX_LOTS = 50;
export const realtimeEmptySchema = z.object({}).strict();
export const realtimeCredentialsSchema = z
  .object({
    accessToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    deviceId: z.uuid(),
  })
  .strict();
export const realtimeSessionSchema = z
  .object({
    userId: z.uuid(),
    sessionId: z.uuid(),
    expiresAt: z.iso.datetime(),
  })
  .strict();
export const subscribeLotSchema = z.object({ lotId: z.uuid() }).strict();
export const liveLotSchema = z
  .object({
    lotId: z.uuid(),
    currentPriceKobo: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .nullable(),
    endsAt: z.iso.datetime(),
    streamId: streamIdSchema,
    serverTime: z.iso.datetime(),
    isLeader: z.boolean(),
  })
  .strict();
export const outbidSchema = liveLotSchema.omit({ isLeader: true });
export const privateLotUpdateSchema = z
  .object({
    lotId: z.uuid(),
    streamId: streamIdSchema,
    currentPriceKobo: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    endsAt: z.number().int().safe().nonnegative(),
    serverTime: z.number().int().safe().nonnegative(),
    leaderId: z.uuid(),
    previousLeaderId: z.uuid().nullable(),
    requesterId: z.uuid(),
  })
  .strict();
export const purchasedLotUpdateSchema = privateLotUpdateSchema
  .omit({ leaderId: true, previousLeaderId: true, requesterId: true })
  .extend({ currentPriceKobo: liveLotSchema.shape.currentPriceKobo })
  .strict();
export const serverTimeSchema = z
  .object({ serverTime: z.iso.datetime() })
  .strict();
export type RealtimeCredentials = z.infer<typeof realtimeCredentialsSchema>;
export type RealtimeSession = z.infer<typeof realtimeSessionSchema>;
export type LiveLot = z.infer<typeof liveLotSchema>;
export type OutbidEvent = z.infer<typeof outbidSchema>;
export function compareStreamIds(a: string, b: string) {
  const left = streamIdSchema.parse(a).split('-').map(BigInt);
  const right = streamIdSchema.parse(b).split('-').map(BigInt);
  for (let i = 0; i < 2; i++) {
    const x = left[i] ?? 0n,
      y = right[i] ?? 0n;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
