import { z } from 'zod';
import { koboSchema } from './kobo-schema';
const revision = z.number().int().min(0).max(2147483646);
export const preBidChangeSchema = z
  .object({
    maxKobo: koboSchema.refine((v) => v > 0),
    feeVersion: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
    expectedRevision: revision,
    idempotencyKey: z.uuid(),
  })
  .strict();
export const preBidCancelSchema = z
  .object({ expectedRevision: revision, idempotencyKey: z.uuid() })
  .strict();
export const preBidSchema = z
  .object({
    id: z.uuid(),
    lotId: z.uuid(),
    maxKobo: koboSchema,
    totalKobo: koboSchema,
    feeVersion: z.string(),
    revision,
    status: z.enum([
      'active',
      'launching',
      'accepted',
      'outbid',
      'cancelled',
      'expired',
    ]),
    startsAt: z.iso.datetime(),
    serverTime: z.iso.datetime(),
  })
  .strict();
export const preBidResponseSchema = z
  .object({ preBid: preBidSchema.nullable(), serverTime: z.iso.datetime() })
  .strict();
export const preBidScheduleSchema = z
  .object({
    action: z.enum(['schedule', 'cancel']),
    startsAt: z.iso.datetime().optional(),
    endsAt: z.iso.datetime().optional(),
    expectedUpdatedAt: z.iso.datetime(),
    idempotencyKey: z.uuid(),
    reason: z.string().trim().min(5).max(500),
  })
  .strict()
  .refine(
    (v) =>
      v.action === 'cancel' ||
      (!!v.startsAt &&
        !!v.endsAt &&
        Date.parse(v.endsAt) > Date.parse(v.startsAt)),
    'End must follow launch time.',
  );
export function canChangePreBid(
  status: string,
  now: number,
  startsAt: number,
  launching: boolean,
) {
  return status === 'scheduled' && !launching && now < startsAt;
}
export const PREBID_BATCH_SIZE = 50;
export type PreBidChange = z.infer<typeof preBidChangeSchema>;
export type PreBidCancel = z.infer<typeof preBidCancelSchema>;
export type PreBid = z.infer<typeof preBidSchema>;
export type PreBidSchedule = z.infer<typeof preBidScheduleSchema>;
export const preBidScheduleResultSchema = z
  .object({
    lotId: z.uuid(),
    status: z.enum(['scheduled', 'cancelled']),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
