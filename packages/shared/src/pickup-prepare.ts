import { z } from 'zod';

/**
 * Staff preparation queue: paid pickup items that have not yet been confirmed
 * physically ready. Confirming readiness (the existing storage `ready`
 * command) is what starts the buyer's pickup deadline, so this queue never
 * starts a clock, sends a notice or changes money by itself.
 */

/** Waiting times are elapsed hours since payment, not centre working days:
 * centres without an enabled calendar still need an honest age signal. */
export const PICKUP_PREPARE_WARN_HOURS = 24;
export const PICKUP_PREPARE_ALERT_HOURS = 48;
export const PICKUP_PREPARE_REFERENCE_MAX = 40;

/** Preset reasons keep scanning fast; staff may add a note. */
export const pickupPrepareReasons = [
  'Item located and placed on the collection shelf',
  'Item checked against listing photos and staged',
  'Item returned from repair or holding area and staged',
] as const;

const cursorPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z~[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const pickupPrepareQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(25),
    cursor: z.string().regex(cursorPattern).optional(),
    search: z.string().trim().max(120).default(''),
    locationId: z.uuid().optional(),
    /** Exact item reference from a barcode scanner or typed label. Raw
     * scanner input (possibly a QR link) is accepted and normalised. */
    reference: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .transform(normalisePickupReference)
      .pipe(z.string().min(1).max(PICKUP_PREPARE_REFERENCE_MAX))
      .optional(),
  })
  .strict();

export const pickupPrepareItemSchema = z
  .object({
    invoiceLineId: z.uuid(),
    lotId: z.uuid(),
    reference: z.string(),
    title: z.string(),
    invoiceNumber: z.string(),
    buyerName: z.string(),
    locationId: z.uuid(),
    location: z.string(),
    paidAt: z.iso.datetime(),
    thumbnailUrl: z.string().nullable(),
    policyEnabled: z.boolean(),
  })
  .strict();

export const pickupPrepareCentreSchema = z
  .object({
    locationId: z.uuid(),
    location: z.string(),
    count: z.number().int().nonnegative(),
    policyEnabled: z.boolean(),
  })
  .strict();

export const pickupPrepareSummarySchema = z
  .object({
    total: z.number().int().nonnegative(),
    overWarn: z.number().int().nonnegative(),
    overAlert: z.number().int().nonnegative(),
    oldestPaidAt: z.iso.datetime().nullable(),
    centres: z.array(pickupPrepareCentreSchema).max(50),
  })
  .strict();

export const pickupPreparePageSchema = z
  .object({
    items: z.array(pickupPrepareItemSchema).max(50),
    nextCursor: z.string().regex(cursorPattern).nullable(),
    serverTime: z.iso.datetime(),
    summary: pickupPrepareSummarySchema,
  })
  .strict();

export type PickupPrepareInput = z.input<typeof pickupPrepareQuerySchema>;
export type PickupPrepareItem = z.infer<typeof pickupPrepareItemSchema>;
export type PickupPreparePage = z.infer<typeof pickupPreparePageSchema>;
export type PickupPrepareCentre = z.infer<typeof pickupPrepareCentreSchema>;

export function pickupPrepareCursor(paidAt: string, invoiceLineId: string) {
  return `${paidAt}~${invoiceLineId}`;
}

export function parsePickupPrepareCursor(cursor: string) {
  const [paidAt = '', invoiceLineId = ''] = cursor.split('~');
  return { paidAt, invoiceLineId };
}

export type PickupPrepareTone = 'normal' | 'warn' | 'alert';

export function pickupPrepareTone(
  paidAt: string,
  now: Date,
): PickupPrepareTone {
  const hours = (now.getTime() - new Date(paidAt).getTime()) / 3_600_000;
  if (hours >= PICKUP_PREPARE_ALERT_HOURS) return 'alert';
  if (hours >= PICKUP_PREPARE_WARN_HOURS) return 'warn';
  return 'normal';
}

/** Compact elapsed label such as "45 min", "5 h", "2 d 3 h". */
export function pickupPrepareWait(paidAt: string, now: Date) {
  const minutes = Math.max(
    0,
    Math.floor((now.getTime() - new Date(paidAt).getTime()) / 60_000),
  );
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24),
    rest = hours % 24;
  return rest ? `${days} d ${rest} h` : `${days} d`;
}

/** Scanner input normalisation: trims, upper-cases and strips a URL prefix
 * so a QR label that encodes a link still resolves to its item reference. */
export function normalisePickupReference(raw: string) {
  const value = raw.trim();
  const last = value.includes('/') ? (value.split('/').pop() ?? '') : value;
  return last.replace(/[^A-Za-z0-9-]/g, '').toUpperCase();
}
