import { z } from 'zod';
import { koboSchema } from './kobo-schema';

// Inventory batches (T15e). A batch is one purchase from one supplier: one
// price, many items, paid in full when bought (owner decision 2026-11-24).

export const batchStatuses = [
  'arriving',
  'received',
  'selling',
  'closed',
] as const;
export type BatchStatus = (typeof batchStatuses)[number];
export const batchStatusLabels: Record<BatchStatus, string> = {
  arriving: 'Arriving',
  received: 'Received',
  selling: 'Selling',
  closed: 'Closed',
};
export const batchTabs = [
  'open',
  'arriving',
  'closed',
  'all',
  'deleted',
] as const;
export type BatchTab = (typeof batchTabs)[number];
export const costShareMethods = ['retail', 'equal'] as const;
export type CostShareMethod = (typeof costShareMethods)[number];
export const paidFromAccounts = ['business', 'personal'] as const;
export const paidFromLabels: Record<(typeof paidFromAccounts)[number], string> =
  { business: 'Business account', personal: 'Personal account' };

export const BATCH_PAGE_SIZE = 50;
export const BATCH_RESTORE_DAYS = 30;
export const BATCH_PURGE_INTERVAL_MS = 60 * 60_000;
export const batchPurgeAt = (deletedAt: string) =>
  new Date(
    Date.parse(deletedAt) + BATCH_RESTORE_DAYS * 86400_000,
  ).toISOString();
export const BATCH_EXPORT_MAX_ROWS = 5_000;
export const BATCH_MAX_FILES = 10;
export const BATCH_FILE_MAX_BYTES = 5 * 1024 * 1024;
export const BATCH_MAX_ITEMS = 100_000;
/** Unsold after this many relists: staff are asked what to do with it. */
export const BATCH_STUCK_RELISTS = 2;
export const batchFileTypes = {
  'application/pdf': 'PDF',
  'image/jpeg': 'Photo',
  'image/png': 'Photo',
  'image/webp': 'Photo',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'application/vnd.ms-excel': 'Excel',
} as const;
export type BatchFileType = keyof typeof batchFileTypes;

/** The file's real type from its first bytes; null when not allowed. */
export function sniffBatchFile(bytes: Uint8Array): BatchFileType | null {
  const starts = (at: number, ...values: number[]) =>
    values.every((v, i) => bytes[at + i] === v);
  if (starts(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf';
  if (starts(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))
    return 'image/png';
  if (starts(0, 0x52, 0x49, 0x46, 0x46) && starts(8, 0x57, 0x45, 0x42, 0x50))
    return 'image/webp';
  if (starts(0, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1))
    return 'application/vnd.ms-excel';
  if (starts(0, 0x50, 0x4b, 0x03, 0x04))
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return null;
}

// ----------------------------------------------------------------- money --

export type BatchCosts = {
  costSupplierKobo: number;
  costTransportKobo: number;
  costCustomsKobo: number;
  costOtherKobo: number;
};
export function batchTotalCostKobo(costs: BatchCosts): number {
  const total =
    costs.costSupplierKobo +
    costs.costTransportKobo +
    costs.costCustomsKobo +
    costs.costOtherKobo;
  if (!Number.isSafeInteger(total) || total < 0)
    throw new Error('The batch cost is out of range.');
  return total;
}

/**
 * Each lot's share of the batch cost. The shares always add up to the exact
 * batch cost: leftover kobo go to the most expensive lot (lowest id on a tie).
 * With no retail prices at all, "by retail value" falls back to equally.
 */
export function shareBatchCost(
  totalKobo: number,
  method: CostShareMethod,
  lots: readonly { id: string; retailPriceKobo: number }[],
): Map<string, number> {
  const shares = new Map<string, number>();
  const first = lots[0];
  if (!first) return shares;
  const total = BigInt(totalKobo);
  const retailSum = lots.reduce((s, l) => s + BigInt(l.retailPriceKobo), 0n);
  const equal = method === 'equal' || retailSum === 0n;
  let priciest = first;
  let given = 0n;
  for (const lot of lots) {
    if (
      lot.retailPriceKobo > priciest.retailPriceKobo ||
      (lot.retailPriceKobo === priciest.retailPriceKobo && lot.id < priciest.id)
    )
      priciest = lot;
    const share = equal
      ? total / BigInt(lots.length)
      : (total * BigInt(lot.retailPriceKobo)) / retailSum;
    given += share;
    shares.set(lot.id, Number(share));
  }
  shares.set(
    priciest.id,
    (shares.get(priciest.id) ?? 0) + Number(total - given),
  );
  return shares;
}

/** Hammer + buyer's premium, from paid invoices only (refunds drop out). */
export function moneyBackKobo(
  lines: readonly {
    invoiceStatus: string;
    hammerKobo: number;
    premiumKobo: number;
  }[],
): number {
  return lines.reduce(
    (sum, l) =>
      l.invoiceStatus === 'paid' ? sum + l.hammerKobo + l.premiumKobo : sum,
    0,
  );
}
export const batchMarginKobo = (moneyBack: number, cost: number) =>
  moneyBack - cost;
/** Whole percent, rounded half up; null when there is nothing to divide by. */
export function percentOf(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Number((BigInt(part) * 200n + BigInt(whole)) / (BigInt(whole) * 2n));
}
export const recoveryPercent = (moneyBack: number, cost: number) =>
  percentOf(moneyBack, cost);

/** Money back by day since received, up to `end`. */
export function recoveryCurve(
  start: string,
  end: string,
  byDay: ReadonlyMap<string, number>,
  costKobo: number,
) {
  const points: { day: string; dayNumber: number; cumulativeKobo: number }[] =
    [];
  let cumulative = 0;
  let breakEvenOn: string | null = null;
  let breakEvenDay: number | null = null;
  // Sales before the receive date (it was recorded late) count from day 0.
  for (const [d, amount] of byDay) if (d < start) cumulative += amount;
  const first = Date.parse(start + 'T00:00:00Z');
  const days = Math.max(
    0,
    Math.round((Date.parse(end + 'T00:00:00Z') - first) / 86_400_000),
  );
  for (let i = 0; i <= days; i++) {
    const current = new Date(first + i * 86_400_000).toISOString().slice(0, 10);
    cumulative += byDay.get(current) ?? 0;
    if (breakEvenOn === null && costKobo > 0 && cumulative >= costKobo) {
      breakEvenOn = current;
      breakEvenDay = i;
    }
    points.push({ day: current, dayNumber: i, cumulativeKobo: cumulative });
  }
  return { points, breakEvenOn, breakEvenDay };
}

// ---------------------------------------------------------------- status --

/** Arriving → Received is by hand; Selling and Closed follow the lots. */
export function nextBatchStatus(input: {
  status: BatchStatus;
  /** Off after an admin reopens a batch by hand. */
  autoClose: boolean;
  itemsReceived: number | null;
  /** Physical items with a lot, written-off ones included. */
  lots: number;
  /** A lot has been published (scheduled, live or ended). */
  published: boolean;
  sold: number;
  writtenOff: number;
}): BatchStatus {
  if (input.status === 'closed') return 'closed';
  if (
    input.autoClose &&
    input.status !== 'arriving' &&
    input.itemsReceived !== null &&
    input.lots > 0 &&
    input.lots >= input.itemsReceived &&
    input.sold + input.writtenOff >= input.lots
  )
    return 'closed';
  return input.published ? 'selling' : input.status;
}

/** Why a lot can't go in this batch; null when it can. */
export function batchPickProblem(batch: {
  status: string;
  locationId: string;
  lotLocationId: string;
}): string | null {
  if (batch.status === 'closed')
    return 'This batch is closed. Pick an open batch.';
  if (batch.locationId !== batch.lotLocationId)
    return 'This batch is at another pickup location. Pick a batch at this location.';
  return null;
}

// --------------------------------------------------------------- schemas --

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z.union([z.null(), text(max)]).transform((v) => (v ? v : null));
const day = z.iso.date('Pick a date.');

export const batchSaveSchema = z
  .object({
    /** Null to create. */
    id: z.uuid().nullable(),
    expectedUpdatedAt: z.iso.datetime().nullable(),
    idempotencyKey: z.uuid(),
    supplierId: z.uuid('Pick a supplier.'),
    name: text(80).min(1, 'Give the batch a short name.'),
    supplierRef: optionalText(80),
    boughtOn: day,
    locationId: z.uuid('Pick a pickup location.'),
    status: z.enum(['arriving', 'received']),
    expectedOn: day.nullable(),
    itemsExpected: z
      .number('Enter how many items, at least 1.')
      .int('Use a whole number of items.')
      .min(1, 'Enter how many items, at least 1.')
      .max(BATCH_MAX_ITEMS, 'Enter 100,000 items or fewer.'),
    categoryIds: z.array(z.uuid()).max(20),
    costSupplierKobo: koboSchema,
    costTransportKobo: koboSchema,
    costCustomsKobo: koboSchema,
    costOtherKobo: koboSchema,
    costShareMethod: z.enum(costShareMethods),
    paidFrom: z.enum(paidFromAccounts).nullable(),
    notes: optionalText(1000),
  })
  .strict()
  .superRefine((v, ctx) => {
    const total =
      v.costSupplierKobo +
      v.costTransportKobo +
      v.costCustomsKobo +
      v.costOtherKobo;
    if (total <= 0 || !Number.isSafeInteger(total))
      ctx.addIssue({
        code: 'custom',
        path: ['costSupplierKobo'],
        message: 'Enter what the batch cost. It must be more than ₦0.',
      });
    if (v.status === 'arriving' && !v.expectedOn)
      ctx.addIssue({
        code: 'custom',
        path: ['expectedOn'],
        message: 'Pick the day you expect it.',
      });
  });
export type BatchSave = z.input<typeof batchSaveSchema>;

const command = {
  id: z.uuid(),
  expectedUpdatedAt: z.iso.datetime(),
  idempotencyKey: z.uuid(),
};
export const batchReceiveSchema = z
  .object({
    ...command,
    itemsReceived: z
      .number('Enter how many items arrived.')
      .int('Use a whole number of items.')
      .min(1, 'Enter how many items arrived, at least 1.')
      .max(BATCH_MAX_ITEMS, 'Enter 100,000 items or fewer.'),
  })
  .strict();
export const batchReasonSchema = z
  .object({ ...command, reason: text(200).min(3, 'Give a reason.') })
  .strict();
export const batchDeleteSchema = batchReasonSchema
  .extend({ confirmation: z.string().min(1).max(12) })
  .strict();
export const batchCleanupSchema = z
  .object({ removed: z.number().int().nonnegative() })
  .strict();
export const batchWriteOffSchema = z
  .object({
    lotIds: z.array(z.uuid()).min(1).max(50),
    reason: text(200).min(3, 'Give a reason.'),
    idempotencyKey: z.uuid(),
  })
  .strict();
export const batchWriteOffResultSchema = z
  .object({
    done: z.number().int(),
    skipped: z.array(
      z
        .object({ id: z.uuid(), lotNumber: z.string(), reason: z.string() })
        .strict(),
    ),
  })
  .strict();

const csvUuids = z
  .string()
  .max(2000)
  .transform((v) => v.split(',').filter(Boolean))
  .pipe(z.array(z.uuid()).max(50));
export const batchListQuerySchema = z
  .object({
    tab: z.enum(batchTabs).default('open'),
    search: text(100).optional(),
    supplierIds: csvUuids.optional(),
    locationIds: csvUuids.optional(),
    status: z.enum(batchStatuses).optional(),
    receivedFrom: day.optional(),
    receivedTo: day.optional(),
    cursor: z.string().max(400).optional(),
    limit: z.coerce.number().int().min(1).max(BATCH_PAGE_SIZE).default(20),
  })
  .strict();
export type BatchListQuery = z.input<typeof batchListQuerySchema>;
export type BatchListFilters = z.output<typeof batchListQuerySchema>;

const money = koboSchema.nullable();
// Every money field is null for staff without batches.costs.
export const batchRowSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    supplierId: z.uuid(),
    supplierName: z.string(),
    locationName: z.string(),
    locationCode: z.string(),
    status: z.enum(batchStatuses),
    boughtOn: day,
    expectedOn: day.nullable(),
    receivedOn: day.nullable(),
    itemsExpected: z.number().int(),
    itemsReceived: z.number().int().nullable(),
    lots: z.number().int(),
    sold: z.number().int(),
    writtenOff: z.number().int(),
    intakenPercent: z.number().int(),
    soldPercent: z.number().int(),
    costKobo: money,
    moneyBackKobo: money,
    /** Negative until the batch has earned its cost back. */
    marginKobo: z.number().int().nullable(),
    recoveryPercent: z.number().int().nullable(),
    updatedAt: z.iso.datetime(),
    deletedAt: z.iso.datetime().nullable().optional(),
  })
  .strict();
export type BatchRow = z.infer<typeof batchRowSchema>;

const batchAccess = {
  canManage: z.boolean(),
  canReceive: z.boolean(),
  canSeeCosts: z.boolean(),
};
export const batchPageSchema = z
  .object({
    items: z.array(batchRowSchema).max(BATCH_PAGE_SIZE),
    counts: z
      .object({
        open: z.number().int(),
        arriving: z.number().int(),
        closed: z.number().int(),
        all: z.number().int(),
        deleted: z.number().int().default(0),
      })
      .strict(),
    cards: z
      .object({
        unsoldCostKobo: money,
        unsoldLots: z.number().int(),
        unsoldLocations: z.number().int(),
        openBatches: z.number().int(),
        arrivingThisWeek: z.number().int(),
        averageRecoveryPercent: z.number().int().nullable(),
        oldestUnsold: z
          .object({
            days: z.number().int(),
            batchCode: z.string(),
            locationName: z.string(),
          })
          .strict()
          .nullable(),
      })
      .strict(),
    nextCursor: z.string().nullable(),
    ...batchAccess,
  })
  .strict();
export type BatchPage = z.infer<typeof batchPageSchema>;

export const batchFileSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    type: z.string(),
    bytes: z.number().int(),
    addedAt: z.iso.datetime(),
    addedBy: z.string(),
  })
  .strict();
export const batchFileUploadSchema = z
  .object({
    name: text(120).min(1),
    /** Base64 file content. */
    content: z
      .string()
      .min(1)
      .max(Math.ceil((BATCH_FILE_MAX_BYTES * 4) / 3) + 8),
    idempotencyKey: z.uuid(),
  })
  .strict();
export const batchFilesSchema = z
  .object({ items: z.array(batchFileSchema).max(BATCH_MAX_FILES) })
  .strict();

export const batchDetailSchema = z
  .object({
    canDelete: z.boolean().optional(),
    canRestore: z.boolean().optional(),
    deleteReason: z.string().nullable().optional(),
    purgeAt: z.iso.datetime().nullable().optional(),
    batch: batchRowSchema,
    supplierRef: z.string().nullable(),
    locationId: z.uuid(),
    categories: z.array(z.object({ id: z.uuid(), name: z.string() }).strict()),
    /** Null without batches.costs. */
    costs: z
      .object({
        costSupplierKobo: koboSchema,
        costTransportKobo: koboSchema,
        costCustomsKobo: koboSchema,
        costOtherKobo: koboSchema,
        costShareMethod: z.enum(costShareMethods),
        paidFrom: z.enum(paidFromAccounts).nullable(),
      })
      .strict()
      .nullable(),
    notes: z.string().nullable(),
    closedAt: z.iso.datetime().nullable(),
    closedReason: z.string().nullable(),
    /** Null without batches.costs, or before the batch is received. */
    recovery: z
      .object({
        points: z.array(
          z
            .object({
              day,
              dayNumber: z.number().int(),
              cumulativeKobo: koboSchema,
            })
            .strict(),
        ),
        breakEvenOn: day.nullable(),
        breakEvenDay: z.number().int().nullable(),
      })
      .strict()
      .nullable(),
    left: z
      .object({
        unsold: z.number().int(),
        categories: z.array(
          z
            .object({
              name: z.string(),
              items: z.number().int(),
              costKobo: money,
            })
            .strict(),
        ),
        /** Items unsold after two relists. */
        stuck: z.number().int(),
      })
      .strict(),
    /** Unit costs change until every received item has a lot. */
    costsAreEstimates: z.boolean(),
    ...batchAccess,
  })
  .strict();
export type BatchDetail = z.infer<typeof batchDetailSchema>;

export const batchStuckPageSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.uuid(),
            lotNumber: z.string(),
            title: z.string(),
            relists: z.number().int(),
          })
          .strict(),
      )
      .max(50),
    nextCursor: z.string().nullable(),
  })
  .strict();
export type BatchStuckLot = z.infer<
  typeof batchStuckPageSchema
>['items'][number];
export const batchActivitySchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.uuid(),
            at: z.iso.datetime(),
            actor: z.string(),
            label: z.string(),
          })
          .strict(),
      )
      .max(50),
    nextCursor: z.string().nullable(),
  })
  .strict();

/** Open batches at one pickup location, for the lot form. Never any costs. */
export const batchPickerSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.uuid(),
            code: z.string(),
            name: z.string(),
            supplierName: z.string(),
            locationId: z.uuid(),
            status: z.enum(batchStatuses),
            itemsExpected: z.number().int(),
            lots: z.number().int(),
          })
          .strict(),
      )
      .max(BATCH_PAGE_SIZE),
    nextCursor: z.string().nullable(),
    /** The batch this person used last, when it is still open here. */
    lastUsedId: z.uuid().nullable(),
    canAdd: z.boolean(),
  })
  .strict();
export type BatchPicker = z.infer<typeof batchPickerSchema>;
export type BatchPickerItem = BatchPicker['items'][number];
export const batchPickerQuerySchema = z
  .object({
    locationId: z.uuid().optional(),
    /** Return only this batch, open or closed (a lot's own batch). */
    id: z.uuid().optional(),
    search: text(100).optional(),
    cursor: z.string().max(400).optional(),
  })
  .strict();

export const batchFormSchema = z
  .object({
    suppliers: z
      .array(z.object({ id: z.uuid(), name: z.string() }).strict())
      .max(500),
    locations: z.array(
      z.object({ id: z.uuid(), name: z.string(), code: z.string() }).strict(),
    ),
    categories: z.array(z.object({ id: z.uuid(), name: z.string() }).strict()),
    /** The likely next number; the real one is given on save. */
    nextCode: z.string(),
    canAddSupplier: z.boolean(),
  })
  .strict();
export type BatchFormOptions = z.infer<typeof batchFormSchema>;
export const batchResultSchema = z
  .object({ id: z.uuid(), message: z.string() })
  .strict();
export type BatchResult = z.infer<typeof batchResultSchema>;
export const batchExportSchema = z
  .object({ filename: z.string(), csv: z.string(), rows: z.number().int() })
  .strict();
export const batchRecalcSchema = z
  .object({ batches: z.number().int() })
  .strict();
