import { z } from 'zod';

export const BID_PREPARATION_MS = 60000;
export const BID_FEE_VERSION = 'auction-fees-v1';
export const BID_MAINTENANCE_MS = 1000;
export const BID_PREPARE_LIMIT = 30;
export const BID_PREPARE_IP_LIMIT = 120;
export const BID_CONFIRM_IP_LIMIT = 120;
export const BID_CONFIRM_GLOBAL_LIMIT = 6000;
const kobo = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const prepareBidSchema = z
  .object({
    maxKobo: kobo.positive(),
    idempotencyKey: z.uuid(),
  })
  .strict();
export const confirmBidSchema = z
  .object({
    preparationId: z.uuid(),
    idempotencyKey: z.uuid(),
  })
  .strict();
export const bidPreparationSchema = z
  .object({
    preparationId: z.uuid(),
    idempotencyKey: z.uuid(),
    lotId: z.uuid(),
    maxKobo: kobo,
    totalKobo: kobo,
    reservedKobo: kobo,
    expiresAt: z.iso.datetime(),
    feeVersion: z.string(),
  })
  .strict();
export const bidResultSchema = z
  .object({
    status: z.literal('accepted'),
    isLeader: z.boolean(),
    currentPriceKobo: kobo,
    endsAt: z.iso.datetime(),
    serverTime: z.iso.datetime(),
    streamId: z.string().regex(/^\d+-\d+$/),
  })
  .strict();
export const cancelBidResultSchema = z
  .object({
    status: z.enum(['cancelled', 'accepted', 'rejected', 'ready', 'outbid']),
  })
  .strict();
export type PrepareBidInput = z.infer<typeof prepareBidSchema>;
export type ConfirmBidInput = z.infer<typeof confirmBidSchema>;
