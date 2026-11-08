import { z } from 'zod';
import { streamIdSchema } from './stream-id-schema';
export const LIVE_MONITOR_REFRESH_MS = 1000;
export const LIVE_MONITOR_STALE_MS = 12000;
export const LIVE_MONITOR_PAGE_SIZE = 50;
export const LIVE_PRESENCE_LEASE_MS = 15000;
export const LIVE_RECOVERY_WINDOW_MS = 5000;
export const LIVE_BIDDER_HASH_DOMAIN = 'lotvanta-live:';
export const monitorJoinSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), serverTime: z.iso.datetime() }).strict(),
  z
    .object({
      ok: z.literal(false),
      code: z.enum(['unavailable', 'forbidden', 'unauthenticated']),
    })
    .strict(),
]);
export const monitorSignalSchema = z
  .object({
    revision: z.number().int().safe().nonnegative(),
    serverTime: z.iso.datetime(),
  })
  .strict();
export const liveMonitorPrefix = (namespace: string) => {
  if (!/^[a-zA-Z0-9:_-]{1,160}$/.test(namespace))
    throw new Error('Invalid live namespace');
  return 'lotvanta:monitor:' + namespace;
};
export const auctionControlPrefix = (namespace: string) => {
  liveMonitorPrefix(namespace);
  return 'lotvanta:controls:' + namespace;
};
const count = z.number().int().safe().nonnegative();
const money = count;
export const liveMonitorQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(25),
    cursor: z.string().max(2000).optional(),
    locationId: z.uuid().optional(),
    categoryId: z.uuid().optional(),
  })
  .strict();
export const monitorLotSchema = z
  .object({
    id: z.uuid(),
    reference: z.string().max(80),
    title: z.string().max(200),
    thumbnail: z.string().max(2000).nullable(),
    categoryId: z.uuid(),
    category: z.string().max(120),
    locationId: z.uuid(),
    location: z.string().max(120),
    runTimeMs: count.nullable(),
    endsAt: z.iso.datetime(),
    currentPriceKobo: money.nullable(),
    bidCount: count,
    watchers: count,
    extensions: count,
    leading: z.string().max(80).nullable(),
    area: z.string().max(80).nullable(),
    paused: z.boolean(),
    remainingMs: count.nullable(),
    revision: z.string().max(160),
    streamId: streamIdSchema,
    serverTime: z.iso.datetime(),
  })
  .strict();
export const monitorLotsSchema = z
  .object({
    items: z.array(monitorLotSchema).max(50),
    nextCursor: z.string().max(2000).nullable(),
    serverTime: z.iso.datetime(),
    revision: count,
  })
  .strict();
export const monitorSummarySchema = z
  .object({
    serverTime: z.iso.datetime(),
    revision: count,
    observedSince: z.iso.datetime(),
    paused: z.boolean(),
    phase: z.enum(['live', 'paused', 'resuming']),
    liveCount: count,
    closing15Count: count,
    endingHourCount: count,
    endedTodayCount: count,
    soldTodayCount: count,
    gmvTodayKobo: money,
    bidsPerMinute: count,
    bidsPeak: count,
    bidsPeakAt: z.iso.datetime().nullable(),
    onlineBuyers: count.nullable(),
    onlineBidBuyers: count.nullable(),
    extensionCount: count,
    extendedLotCount: count,
  })
  .strict();
export const monitorSeriesSchema = z
  .object({
    serverTime: z.iso.datetime(),
    points: z
      .array(z.object({ at: z.iso.datetime(), value: count }).strict())
      .max(60),
  })
  .strict();
export const monitorIssueKindSchema = z.enum([
  'wallet',
  'release',
  'connections',
  'late',
]);
export const monitorIssueSchema = z
  .object({
    kind: monitorIssueKindSchema,
    label: z.string().max(120),
    context: z.string().max(240),
    count: count.nullable(),
    tone: z.enum(['warning', 'danger', 'success', 'info']),
  })
  .strict();
export const monitorIssuesSchema = z
  .object({
    serverTime: z.iso.datetime(),
    observedSince: z.iso.datetime(),
    items: z.array(monitorIssueSchema).max(4),
  })
  .strict();
export const monitorClosedRowSchema = z
  .object({
    id: z.uuid(),
    reference: z.string().max(80),
    title: z.string().max(200),
    winner: z.string().max(80).nullable(),
    bidCount: count,
    status: z.enum(['sold', 'unsold', 'payment_pending']),
    hammerKobo: money.nullable(),
    closedAt: z.iso.datetime(),
  })
  .strict();
export const monitorClosedSchema = z
  .object({
    serverTime: z.iso.datetime(),
    totalToday: count,
    items: z.array(monitorClosedRowSchema).max(50),
    nextCursor: z.string().max(2000).nullable(),
  })
  .strict();
export const monitorFiltersSchema = z
  .object({
    locations: z
      .array(z.object({ id: z.uuid(), name: z.string().max(120) }).strict())
      .max(50),
    categories: z
      .array(z.object({ id: z.uuid(), name: z.string().max(120) }).strict())
      .max(50),
  })
  .strict();
export const monitorPatchSchema = z
  .object({
    lotId: z.uuid(),
    currentPriceKobo: money.nullable(),
    endsAt: z.iso.datetime(),
    streamId: streamIdSchema,
    serverTime: z.iso.datetime(),
    leading: z.string().max(80).nullable(),
  })
  .strict();
export const monitorCommandSchema = z
  .object({
    idempotencyKey: z.uuid(),
    reason: z.string().trim().min(5).max(1000),
    operation: z.enum([
      'pause',
      'resume',
      'extend',
      'cancel',
      'pause_all',
      'resume_all',
      'history',
      'message',
    ]),
    lotId: z.uuid().optional(),
    expectedRevision: z.string().max(160).optional(),
    confirmation: z.string().max(40).optional(),
    message: z.string().trim().min(5).max(2000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!['pause_all', 'resume_all'].includes(value.operation) && !value.lotId)
      context.addIssue({
        code: 'custom',
        message: 'Choose an item.',
        path: ['lotId'],
      });
    if (value.operation === 'message' && !value.message)
      context.addIssue({
        code: 'custom',
        message: 'Enter the message.',
        path: ['message'],
      });
  });
export const monitorCommandResultSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(['pending', 'completed']),
    message: z.string().max(300),
  })
  .strict();
export const monitorDetailPageSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.string().max(160),
            at: z.iso.datetime(),
            summary: z.string().max(300),
            reference: z.string().max(80).nullable(),
          })
          .strict(),
      )
      .max(50),
    nextCursor: z.string().max(2000).nullable(),
    serverTime: z.iso.datetime(),
  })
  .strict();
export type MonitorLot = z.infer<typeof monitorLotSchema>;
export type MonitorSummary = z.infer<typeof monitorSummarySchema>;
export type MonitorIssues = z.infer<typeof monitorIssuesSchema>;
export type MonitorClosed = z.infer<typeof monitorClosedSchema>;
export type MonitorSeries = z.infer<typeof monitorSeriesSchema>;
export type MonitorQuery = z.input<typeof liveMonitorQuerySchema>;
export type MonitorCommand = z.infer<typeof monitorCommandSchema>;
export function maskMonitorName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  const chars = Array.from(first);
  return chars.length > 3
    ? chars.slice(0, 2).join('') + '***' + chars.slice(-1).join('')
    : (chars[0] ?? 'B') + '***';
}
// Callers provide authoritative server time. No wall-clock fallback is permitted.
export function monitorSecondsLeft(
  endsAt: string,
  serverNow: number | null,
  remainingMs: number | null = null,
): number | null {
  if (serverNow === null || !Number.isFinite(serverNow)) return null;
  return Math.max(
    0,
    Math.ceil((remainingMs ?? Date.parse(endsAt) - serverNow) / 1000),
  );
}
export function monitorTimerText(seconds: number | null) {
  if (seconds === null) return 'Time unavailable';
  if (!seconds) return 'Closing';
  const hours = Math.floor(seconds / 3600),
    minutes = Math.floor((seconds % 3600) / 60),
    rest = seconds % 60;
  return (
    [
      hours && `${hours} hour${hours === 1 ? '' : 's'}`,
      minutes && `${minutes} minute${minutes === 1 ? '' : 's'}`,
      rest && `${rest} second${rest === 1 ? '' : 's'}`,
    ]
      .filter(Boolean)
      .join(' ') + ' left'
  );
}
