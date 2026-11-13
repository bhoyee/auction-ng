import { z } from 'zod';
import { databaseValues } from './database-values';
import { koboSchema } from './kobo-schema';
import { lotDetailsSchema } from './catalogue-schemas';

// Lots inventory (T15e, owner decisions 2026-11-13). Lots go Draft →
// Scheduled → Live → Sold or Unsold; there is no review step for now.

/** What staff see a lot as, worked out from its status and auction result. */
export const lotStages = [
  'draft',
  'scheduled',
  'live',
  'sold',
  'unsold',
  'cancelled',
] as const;
export type LotStage = (typeof lotStages)[number];

export const lotTabs = [
  'all',
  'drafts',
  'scheduled',
  'live',
  'ending',
  'sold',
  'unsold',
  'archived',
  'deleted',
] as const;
export type LotTab = (typeof lotTabs)[number];

/** Run time presets in hours; custom runs are 1 hour to 7 days. */
export const LOT_RUN_TIME_PRESETS = [12, 24, 36, 48, 72] as const;
export const LOT_RUN_TIME_MIN_MINUTES = 60;
export const LOT_RUN_TIME_MAX_MINUTES = 7 * 24 * 60;
export const LOT_DEFAULT_RUN_TIME_MINUTES = 24 * 60;
export const LOT_MAX_PHOTOS = 12;
export const LOT_MIN_PHOTOS = 3;
export const LOT_RESTORE_DAYS = 30;
export const LOT_PAGE_SIZE = 50;
export const LOT_CSV_MAX_ROWS = 2_000;
export const LOT_EXPORT_MAX_ROWS = 5_000;
export const LOT_TAG_MAX = 20;
export const LOT_TITLE_MAX = 70;

export function lotStage(input: {
  status: string;
  settlementStatus?: string | null;
}): LotStage {
  switch (input.status) {
    case 'draft':
      return 'draft';
    case 'scheduled':
      return 'scheduled';
    case 'open':
    case 'closing':
      return 'live';
    case 'cancelled':
      return 'cancelled';
    default:
      // Closed: sold when a winner was recorded, otherwise unsold.
      return ['paid', 'frozen', 'payment_due'].includes(
        input.settlementStatus ?? '',
      )
        ? 'sold'
        : 'unsold';
  }
}

// ---------------------------------------------------------------- delete --

export type LotDeleteDecision =
  | { allowed: true; cancelsSchedule: boolean }
  | {
      allowed: false;
      /** cancel-first: cancel in the Live monitor; archive-only: sold/unsold. */
      block: 'cancel-first' | 'never' | 'archive-only' | 'permission' | 'done';
      reason: string;
    };

/**
 * Who may delete which lot (ADMIN_DESIGN §5.2). Deleting is a soft delete
 * with a reason; an admin can restore it for 30 days.
 */
export function lotDeleteRule(input: {
  stage: LotStage;
  hasBids: boolean;
  deleted: boolean;
  /** Admins and managers: the lots.delete permission. */
  canDeleteAny: boolean;
  /** Intake staff may delete drafts they created. */
  canDeleteOwnDrafts: boolean;
  isCreator: boolean;
}): LotDeleteDecision {
  if (input.deleted)
    return { allowed: false, block: 'done', reason: 'Already deleted.' };
  const may =
    input.canDeleteAny ||
    (input.canDeleteOwnDrafts && input.isCreator && input.stage === 'draft');
  switch (input.stage) {
    case 'live':
      return input.hasBids
        ? {
            allowed: false,
            block: 'never',
            reason:
              'It’s live with bids, so buyers’ money is on hold for it. Cancel it in the Live monitor instead: every hold is refunded and bidders get a message.',
          }
        : {
            allowed: false,
            block: 'cancel-first',
            reason:
              'It’s live. Cancel it in the Live monitor first (watchers are told), then delete it.',
          };
    case 'sold':
    case 'unsold':
      return {
        allowed: false,
        block: 'archive-only',
        reason:
          'Ended lots are kept for invoices, payouts and reports. Archive it instead.',
      };
    case 'draft':
    case 'scheduled':
    case 'cancelled':
      return may
        ? { allowed: true, cancelsSchedule: input.stage === 'scheduled' }
        : {
            allowed: false,
            block: 'permission',
            reason:
              input.canDeleteOwnDrafts && input.stage === 'draft'
                ? 'You can delete only drafts you created.'
                : 'Your role can’t delete lots.',
          };
  }
}

// ----------------------------------------------------------------- edits --

export type LotEditLocks = {
  /** Nothing can change (ended or cancelled lots). */
  editable: boolean;
  priceLocked: boolean;
  runTimeLocked: boolean;
  categoryLocked: boolean;
  /** Pickup location; the bin can still change within it. */
  locationLocked: boolean;
  /** Bidders and watchers get "lot details updated" after a change. */
  tellBuyers: boolean;
  reason: string | null;
};

/**
 * Drafts, and scheduled lots without pre-bids, can change everything. Pre-bids
 * hold buyers' money against the price and timing, and a live lot's price and
 * timing sit in the bid engine, so those lock; description, photos, item
 * details, included/defects and bin can still change and buyers are told.
 * `hasBids` counts accepted bids and active pre-bids.
 */
export function lotEditLocks(input: {
  stage: LotStage;
  hasBids: boolean;
}): LotEditLocks {
  const open = {
    editable: true,
    priceLocked: false,
    runTimeLocked: false,
    categoryLocked: false,
    locationLocked: false,
    tellBuyers: false,
    reason: null,
  };
  const locked = {
    editable: true,
    priceLocked: true,
    runTimeLocked: true,
    categoryLocked: true,
    locationLocked: true,
  };
  if (input.stage === 'draft') return open;
  // The run time is fixed when a lot is scheduled (the Live monitor keeps the
  // original run time), so it locks from scheduling onwards.
  if (input.stage === 'scheduled')
    return input.hasBids
      ? {
          ...locked,
          tellBuyers: true,
          reason:
            'Buyers have pre-bids on this lot, so price, run time, category and location are locked. You can still fix the description and photos; they’ll be told about the change.',
        }
      : { ...open, runTimeLocked: true };
  if (input.stage === 'live')
    return {
      ...locked,
      tellBuyers: true,
      reason: input.hasBids
        ? 'This lot has bids, so price and run time are locked and it can’t be deleted. You can still fix the description and photos; bidders will be told about the change.'
        : 'This lot is live, so price, run time, category and location are locked. You can still fix the description and photos; watchers will be told about the change.',
    };
  return {
    ...locked,
    editable: false,
    tellBuyers: false,
    reason: 'This lot has ended. Duplicate it to sell the item again.',
  };
}

// ------------------------------------------------------------- duplicate --

/** Copied by Duplicate; photos, bin, history and IDs are never copied. */
export const DUPLICATE_LOT_FIELDS = [
  'title',
  'description',
  'condition',
  'retailPriceKobo',
  'startPriceKobo',
  'fixedPriceKobo',
  'categoryId',
  'locationId',
  'brandId',
  'supplierId',
  'details',
  'included',
  'defects',
  'runTimeMinutes',
] as const;
export type DuplicateLotField = (typeof DUPLICATE_LOT_FIELDS)[number];
export function duplicateLotFields<
  T extends Record<DuplicateLotField, unknown>,
>(lot: T): Pick<T, DuplicateLotField> {
  const copy = {} as Pick<T, DuplicateLotField>;
  for (const key of DUPLICATE_LOT_FIELDS) copy[key] = lot[key];
  return copy;
}

// --------------------------------------------------------------- actions --

export const lotActions = [
  'view',
  'edit',
  'duplicate',
  'print-label',
  'move',
  'relist',
  'archive',
  'unarchive',
  'delete',
  'restore',
  'live-monitor',
] as const;
export type LotAction = (typeof lotActions)[number];

/** The ⋯ menu shows only what this person can do to this lot. */
export function allowedLotActions(input: {
  stage: LotStage;
  hasBids: boolean;
  archived: boolean;
  deleted: boolean;
  deletedAt: Date | null;
  now: Date;
  isCreator: boolean;
  permissions: readonly string[];
}): LotAction[] {
  const can = (p: string) => input.permissions.includes(p);
  if (input.deleted)
    return can('records.purge') &&
      !!input.deletedAt &&
      input.now.getTime() - input.deletedAt.getTime() <
        LOT_RESTORE_DAYS * 86_400_000
      ? ['view', 'restore']
      : ['view'];
  const actions: LotAction[] = ['view'];
  const locks = lotEditLocks(input);
  const write = can('inventory.write');
  if (write && locks.editable && !input.archived) actions.push('edit');
  if (write) actions.push('duplicate');
  actions.push('print-label');
  if (write && locks.editable && !input.archived) actions.push('move');
  if (input.stage === 'live' && can('auctions.manage'))
    actions.push('live-monitor');
  if (input.stage === 'unsold' && can('lots.relist') && !input.archived)
    actions.push('relist');
  if (can('records.archive'))
    if (input.archived) actions.push('unarchive');
    else if (['draft', 'sold', 'unsold', 'cancelled'].includes(input.stage))
      actions.push('archive');
  const del = lotDeleteRule({
    stage: input.stage,
    hasBids: input.hasBids,
    deleted: false,
    canDeleteAny: can('lots.delete'),
    canDeleteOwnDrafts: write,
    isCreator: input.isCreator,
  });
  // Live lots still show Delete to people who may delete, so the dialog can
  // explain the block; anything else only when it's actually allowed.
  if (
    del.allowed ||
    (can('lots.delete') &&
      (del.block === 'cancel-first' || del.block === 'never'))
  )
    actions.push('delete');
  return actions;
}

// --------------------------------------------------------------- schemas --

const text = (max: number) => z.string().trim().max(max);
const tag = z.string().trim().min(1).max(60);
const runTime = z
  .number()
  .int()
  .min(LOT_RUN_TIME_MIN_MINUTES)
  .max(LOT_RUN_TIME_MAX_MINUTES);

export const lotSorts = ['ending', 'newest', 'price', 'bids'] as const;
export type LotSort = (typeof lotSorts)[number];

const csvUuids = z
  .string()
  .max(2000)
  .transform((v) => v.split(',').filter(Boolean))
  .pipe(z.array(z.uuid()).max(50));

export const lotListQuerySchema = z
  .object({
    tab: z.enum(lotTabs).default('all'),
    search: text(100).optional(),
    categoryIds: csvUuids.optional(),
    locationIds: csvUuids.optional(),
    supplierIds: csvUuids.optional(),
    addedByIds: csvUuids.optional(),
    conditions: z
      .string()
      .max(200)
      .transform((v) => v.split(',').filter(Boolean))
      .pipe(z.array(z.enum(databaseValues.lotConditions)))
      .optional(),
    runTimeMinutes: z.coerce.number().int().pipe(runTime).optional(),
    addedFrom: z.iso.date().optional(),
    addedTo: z.iso.date().optional(),
    priceMinKobo: z.coerce.number().int().nonnegative().optional(),
    priceMaxKobo: z.coerce.number().int().nonnegative().optional(),
    binId: z.union([z.uuid(), z.literal('none')]).optional(),
    sort: z.enum(lotSorts).default('ending'),
    cursor: z.string().max(400).optional(),
    limit: z.coerce.number().int().min(1).max(LOT_PAGE_SIZE).default(50),
  })
  .strict();
export type LotListQuery = z.input<typeof lotListQuerySchema>;
export type LotListFilters = z.output<typeof lotListQuerySchema>;

const person = z.object({ id: z.uuid(), name: z.string() }).strict().nullable();

export const lotListRowSchema = z
  .object({
    id: z.uuid(),
    lotNumber: z.string(),
    title: z.string(),
    thumbnailUrl: z.string().nullable(),
    categoryName: z.string(),
    condition: z.enum(databaseValues.lotConditions),
    locationName: z.string(),
    locationCode: z.string(),
    binCode: z.string().nullable(),
    stage: z.enum(lotStages),
    archived: z.boolean(),
    deleted: z.boolean(),
    deletedAt: z.iso.datetime().nullable(),
    deleteReason: z.string().nullable(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    runTimeMinutes: z.number().int(),
    startPriceKobo: koboSchema,
    currentPriceKobo: koboSchema.nullable(),
    retailPriceKobo: koboSchema,
    bids: z.number().int().nonnegative(),
    watching: z.number().int().nonnegative(),
    photos: z.number().int().nonnegative(),
    photosNeeded: z.number().int().nonnegative(),
    winnerName: z.string().nullable(),
    addedBy: person,
    createdAt: z.iso.datetime(),
    actions: z.array(z.enum(lotActions)),
  })
  .strict();
export type LotListRow = z.infer<typeof lotListRowSchema>;

export const lotTabCountsSchema = z
  .object(Object.fromEntries(lotTabs.map((t) => [t, z.number().int()])))
  .strict();

export const lotSummarySchema = z
  .object({
    inStock: z.number().int(),
    inStockRetailKobo: koboSchema,
    live: z.number().int(),
    endingIn24h: z.number().int(),
    drafts: z.number().int(),
    oldestDraftAt: z.iso.datetime().nullable(),
    sold30d: z.number().int(),
    sold30dHammerKobo: koboSchema,
    sold30dRetailKobo: koboSchema,
    unsoldToRelist: z.number().int(),
    ended30d: z.number().int(),
    unsold30d: z.number().int(),
  })
  .strict();

export const lotListPageSchema = z
  .object({
    items: z.array(lotListRowSchema).max(LOT_PAGE_SIZE),
    counts: lotTabCountsSchema,
    summary: lotSummarySchema,
    total: z.number().int(),
    nextCursor: z.string().nullable(),
    serverTime: z.iso.datetime(),
    canCreate: z.boolean(),
    canSeeDeleted: z.boolean(),
  })
  .strict();
export type LotListPage = z.infer<typeof lotListPageSchema>;

/** One form for create and edit; only drafts accept every field. */
export const lotFormSchema = z
  .object({
    title: z.string().trim().min(1).max(LOT_TITLE_MAX),
    description: z.string().trim().min(1).max(10_000),
    condition: z.enum(databaseValues.lotConditions),
    categoryId: z.uuid(),
    locationId: z.uuid(),
    binId: z.uuid().nullable(),
    brandId: z.uuid().nullable(),
    supplierId: z.uuid().nullable(),
    startPriceKobo: koboSchema.refine((v) => v > 0, 'Set a start price.'),
    retailPriceKobo: koboSchema,
    runTimeMinutes: runTime,
    details: lotDetailsSchema,
    included: z.array(tag).max(LOT_TAG_MAX),
    defects: z.array(tag).max(LOT_TAG_MAX),
  })
  .strict();
export type LotForm = z.infer<typeof lotFormSchema>;
export const lotSaveSchema = z
  .object({
    lot: lotFormSchema,
    expectedUpdatedAt: z.iso.datetime().nullable(),
    idempotencyKey: z.uuid(),
  })
  .strict();
export type LotSave = z.infer<typeof lotSaveSchema>;

export const lotPhotoSchema = z
  .object({
    id: z.uuid(),
    url: z.string(),
    thumbnailUrl: z.string().nullable(),
    sortOrder: z.number().int(),
    isDefect: z.boolean(),
  })
  .strict();
export const lotPhotoOrderSchema = z
  .object({
    order: z.array(z.uuid()).min(1).max(LOT_MAX_PHOTOS),
    defects: z.array(z.uuid()).max(LOT_MAX_PHOTOS),
    remove: z.array(z.uuid()).max(LOT_MAX_PHOTOS),
    expectedUpdatedAt: z.iso.datetime(),
  })
  .strict();

export const lotEditorSchema = z
  .object({
    id: z.uuid(),
    lotNumber: z.string(),
    stage: z.enum(lotStages),
    archived: z.boolean(),
    lot: lotFormSchema,
    photos: z.array(lotPhotoSchema),
    hasBids: z.boolean(),
    locks: z
      .object({
        editable: z.boolean(),
        priceLocked: z.boolean(),
        runTimeLocked: z.boolean(),
        categoryLocked: z.boolean(),
        locationLocked: z.boolean(),
        tellBuyers: z.boolean(),
        reason: z.string().nullable(),
      })
      .strict(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type LotEditor = z.infer<typeof lotEditorSchema>;

export const lotJourneyStepSchema = z
  .object({
    key: z.enum(['created', 'scheduled', 'live', 'ended', 'pickup']),
    label: z.string(),
    detail: z.string(),
    state: z.enum(['done', 'current', 'next']),
    at: z.iso.datetime().nullable(),
  })
  .strict();

export const lotViewSchema = z
  .object({
    editor: lotEditorSchema,
    categoryPath: z.string(),
    categoryFields: z.array(
      z
        .object({ key: z.string(), name: z.string(), type: z.string() })
        .strict(),
    ),
    locationName: z.string(),
    locationCode: z.string(),
    binCode: z.string().nullable(),
    brandName: z.string().nullable(),
    supplierName: z.string().nullable(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    currentPriceKobo: koboSchema.nullable(),
    fixedPriceKobo: koboSchema.nullable(),
    bids: z.number().int(),
    watching: z.number().int(),
    leader: z
      .object({
        name: z.string(),
        pastWins: z.number().int(),
        strikes: z.number().int(),
      })
      .strict()
      .nullable(),
    addedBy: person,
    createdAt: z.iso.datetime(),
    deletedAt: z.iso.datetime().nullable(),
    deleteReason: z.string().nullable(),
    journey: z.array(lotJourneyStepSchema),
    actions: z.array(z.enum(lotActions)),
    activityCount: z.number().int(),
    serverTime: z.iso.datetime(),
  })
  .strict();
export type LotView = z.infer<typeof lotViewSchema>;

export const lotBidRowSchema = z
  .object({
    id: z.uuid(),
    at: z.iso.datetime(),
    bidderName: z.string().nullable(),
    maskedName: z.string(),
    amountKobo: koboSchema,
    proxy: z.boolean(),
    leading: z.boolean(),
  })
  .strict();
export const lotWatcherRowSchema = z
  .object({
    name: z.string().nullable(),
    maskedName: z.string(),
    since: z.iso.datetime(),
  })
  .strict();
export const lotActivityRowSchema = z
  .object({
    id: z.uuid(),
    at: z.iso.datetime(),
    actor: z.string(),
    action: z.string(),
    label: z.string(),
  })
  .strict();
export const lotInvoiceSchema = z
  .object({
    invoiceNumber: z.string().nullable(),
    invoiceStatus: z.string().nullable(),
    hammerKobo: koboSchema.nullable(),
    totalKobo: koboSchema.nullable(),
    winnerName: z.string().nullable(),
    pickupStatus: z.string().nullable(),
    collectedAt: z.iso.datetime().nullable(),
  })
  .strict();
export const lotTabPageSchema = <T extends z.ZodType>(row: T) =>
  z
    .object({ items: z.array(row).max(50), nextCursor: z.string().nullable() })
    .strict();

export const lotDeleteSchema = z
  .object({
    reason: z.string().trim().min(3).max(200),
    freeBin: z.boolean(),
    expectedUpdatedAt: z.iso.datetime(),
  })
  .strict();
export const lotVersionSchema = z
  .object({ expectedUpdatedAt: z.iso.datetime() })
  .strict();

export const lotBulkSchema = z
  .object({
    ids: z
      .array(z.uuid())
      .min(1)
      .max(LOT_PAGE_SIZE * 2),
    action: z.enum(['edit', 'move', 'archive', 'delete']),
    changes: z
      .object({
        categoryId: z.uuid().optional(),
        condition: z.enum(databaseValues.lotConditions).optional(),
        locationId: z.uuid().optional(),
        startPriceKobo: koboSchema.refine((v) => v > 0).optional(),
        runTimeMinutes: runTime.optional(),
      })
      .strict()
      .optional(),
    reason: z.string().trim().min(3).max(200).optional(),
    idempotencyKey: z.uuid(),
  })
  .strict();
export type LotBulk = z.infer<typeof lotBulkSchema>;
export const lotBulkResultSchema = z
  .object({
    done: z.number().int(),
    skipped: z.array(
      z
        .object({ id: z.uuid(), lotNumber: z.string(), reason: z.string() })
        .strict(),
    ),
  })
  .strict();

export const lotLabelSchema = z
  .object({
    items: z.array(
      z
        .object({
          id: z.uuid(),
          lotNumber: z.string(),
          title: z.string(),
          binCode: z.string().nullable(),
          locationCode: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

export const lotViewSaveSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    query: z.record(z.string(), z.string().max(400)),
  })
  .strict();
export const lotSavedViewSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    query: z.record(z.string(), z.string()),
  })
  .strict();
export const lotPreferencesSchema = z
  .object({
    hiddenColumns: z.array(z.string().max(40)).max(20),
    layout: z.enum(['table', 'grid']),
  })
  .strict();
export const lotListSetupSchema = z
  .object({
    views: z.array(lotSavedViewSchema).max(20),
    preferences: lotPreferencesSchema,
  })
  .strict();

export const lotMessageResultSchema = z
  .object({ id: z.uuid(), message: z.string() })
  .strict();
export const lotDuplicateResultSchema = z.object({ id: z.uuid() }).strict();
export const lotCsvCheckSchema = z
  .object({
    rows: z.number().int(),
    good: z.number().int(),
    problems: z.array(
      z
        .object({
          row: z.number().int(),
          field: z.string(),
          problem: z.string(),
        })
        .strict(),
    ),
  })
  .strict();
export const lotCsvImportSchema = z
  .object({
    imported: z.number().int(),
    problems: z.number().int(),
    ids: z.array(z.uuid()),
  })
  .strict();
export const lotFileSchema = z
  .object({
    filename: z.string(),
    csv: z.string(),
    rows: z.number().int().optional(),
  })
  .strict();
/** A refused delete arrives as a field error on "delete.<block>". */
export const LOT_DELETE_FIELD = 'delete';
