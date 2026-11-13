import { z } from 'zod';
import { koboSchema } from './kobo-schema';
import { categoryFieldTypes, weekdays } from './lot-setup';

// Response shapes for the Lot setup admin API.
const deleteCheckSchema = z.discriminatedUnion('allowed', [
  z.object({ allowed: z.literal(true) }).strict(),
  z
    .object({
      allowed: z.literal(false),
      reason: z.string(),
      safeOption: z.string(),
    })
    .strict(),
]);
const percent = z.number().min(0).max(1000).nullable();

export const lotSetupSummarySchema = z
  .object({
    categories: z.number().int(),
    locations: z.number().int(),
    conditions: z.number().int(),
    suppliers: z.number().int(),
    brands: z.number().int(),
    canManage: z.boolean(),
  })
  .strict();
export type LotSetupSummary = z.infer<typeof lotSetupSummarySchema>;

export const categoryTreeItemSchema = z
  .object({
    id: z.uuid(),
    parentId: z.uuid().nullable(),
    name: z.string(),
    slug: z.string(),
    icon: z.string(),
    sortOrder: z.number().int(),
    isVisible: z.boolean(),
    lots: z.number().int(),
    live: z.number().int(),
  })
  .strict();
export const categoryTreeSchema = z
  .object({ items: z.array(categoryTreeItemSchema), canManage: z.boolean() })
  .strict();
export type CategoryTree = z.infer<typeof categoryTreeSchema>;
export type CategoryTreeItem = z.infer<typeof categoryTreeItemSchema>;

export const categoryFieldViewSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    key: z.string(),
    type: z.enum(categoryFieldTypes),
    options: z.array(z.string()),
    helpText: z.string().nullable(),
    required: z.boolean(),
    showToBuyers: z.boolean(),
  })
  .strict();
export type CategoryFieldView = z.infer<typeof categoryFieldViewSchema>;

const defaultsSchema = z
  .object({
    runTimeMinutes: z.number().int().nullable(),
    minStartPriceKobo: koboSchema.nullable(),
    minPhotos: z.number().int().nullable(),
  })
  .strict();

export const categoryDetailSchema = z
  .object({
    id: z.uuid(),
    parentId: z.uuid().nullable(),
    parentName: z.string().nullable(),
    name: z.string(),
    slug: z.string(),
    icon: z.string(),
    description: z.string().nullable(),
    isVisible: z.boolean(),
    updatedAt: z.iso.datetime(),
    editedBy: z
      .object({ name: z.string(), at: z.iso.datetime() })
      .strict()
      .nullable(),
    subcategories: z.number().int(),
    defaults: defaultsSchema,
    conditions: z.array(z.string()).nullable(),
    fields: z.array(categoryFieldViewSchema).nullable(),
    // What a new lot in this category actually gets, after inheritance.
    effective: defaultsSchema.extend({
      conditions: z.array(z.string()),
      fields: z.array(categoryFieldViewSchema),
    }),
    stats: z
      .object({
        liveLots: z.number().int(),
        sellThroughPercent: percent,
        averageRetailPercent: percent,
      })
      .strict(),
    lots: z.number().int(),
    deleteCheck: deleteCheckSchema,
    canManage: z.boolean(),
  })
  .strict();
export type CategoryDetail = z.infer<typeof categoryDetailSchema>;

export const locationStatusSchema = z.enum(['open', 'opening', 'closed']);
export const locationCardSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    code: z.string(),
    address: z.string(),
    status: locationStatusSchema,
    opensOn: z.iso.date().nullable(),
    lotsHere: z.number().int(),
    pickupsToday: z.number().int(),
    binsUsedPercent: z.number().int().min(0).max(100),
    // Items still in bins that have a capacity, against that capacity.
    // Null when no bin at the location has a capacity set.
    itemsStored: z.number().int().min(0),
    capacityTotal: z.number().int().min(0),
    spaceUsedPercent: z.number().int().min(0).nullable(),
  })
  .strict();
export const locationListSchema = z
  .object({ items: z.array(locationCardSchema), canManage: z.boolean() })
  .strict();
export type LocationCard = z.infer<typeof locationCardSchema>;

export const openingHoursViewSchema = z
  .object({
    day: z.enum([...weekdays, 'holiday']),
    opens: z.string().nullable(),
    closes: z.string().nullable(),
  })
  .strict();

export const locationDetailSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    code: z.string(),
    address: z.string(),
    landmark: z.string().nullable(),
    phone: z.string().nullable(),
    lat: z.number().nullable(),
    lng: z.number().nullable(),
    status: locationStatusSchema,
    opensOn: z.iso.date().nullable(),
    freeWorkingDays: z.number().int(),
    storageFeeKoboPerDay: koboSchema,
    slotMinutes: z.number().int(),
    slotCapacity: z.number().int(),
    idRequired: z.boolean(),
    deliveryEnabled: z.boolean(),
    binRequiredToPublish: z.boolean(),
    hours: z.array(openingHoursViewSchema),
    usedOnLots: z.number().int(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    bins: z
      .object({
        total: z.number().int(),
        inUse: z.number().int(),
        lotsStored: z.number().int(),
        preview: z.array(
          z.object({ code: z.string(), lots: z.number().int() }).strict(),
        ),
      })
      .strict(),
    staff: z.array(
      z
        .object({ id: z.uuid(), name: z.string(), roleName: z.string() })
        .strict(),
    ),
    deleteCheck: deleteCheckSchema,
    canManage: z.boolean(),
  })
  .strict();
export type LocationDetail = z.infer<typeof locationDetailSchema>;

export const staffOptionsSchema = z
  .object({
    items: z.array(
      z
        .object({ id: z.uuid(), name: z.string(), roleName: z.string() })
        .strict(),
    ),
  })
  .strict();

export const binRowSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    note: z.string().nullable(),
    capacity: z.number().int().nullable(),
    acceptsNewLots: z.boolean(),
    lots: z.number().int(),
    full: z.boolean(),
    status: z.enum(['in_use', 'empty', 'closed']),
    updatedAt: z.iso.datetime(),
    deleteCheck: deleteCheckSchema,
  })
  .strict();
export type BinRow = z.infer<typeof binRowSchema>;
export const binPageSchema = z
  .object({
    location: z
      .object({
        id: z.uuid(),
        name: z.string(),
        code: z.string(),
        binRequiredToPublish: z.boolean(),
        updatedAt: z.iso.datetime(),
      })
      .strict(),
    summary: z
      .object({
        bins: z.number().int(),
        openForNewLots: z.number().int(),
        lotsInBins: z.number().int(),
        lotsAtLocation: z.number().int(),
        lotsWithoutBin: z.number().int(),
      })
      .strict(),
    counts: z
      .object({
        all: z.number().int(),
        in_use: z.number().int(),
        empty: z.number().int(),
        closed: z.number().int(),
      })
      .strict(),
    existingCodes: z.array(z.string()),
    items: z.array(binRowSchema),
    nextCursor: z.string().nullable(),
    canManage: z.boolean(),
  })
  .strict();
export type BinPage = z.infer<typeof binPageSchema>;

export const binLabelsSchema = z
  .object({
    items: z.array(
      z
        .object({
          id: z.uuid(),
          code: z.string(),
          note: z.string().nullable(),
          locationCode: z.string(),
          locationName: z.string(),
          // Scanned at intake and pickup: identifies the bin unambiguously.
          qr: z.string(),
        })
        .strict(),
    ),
  })
  .strict();
export type BinLabels = z.infer<typeof binLabelsSchema>;

export const conditionRowSchema = z
  .object({
    id: z.uuid(),
    key: z.string(),
    label: z.string(),
    meaning: z.string(),
    colour: z.string(),
    sortOrder: z.number().int(),
    active: z.boolean(),
    lots: z.number().int(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const conditionListSchema = z
  .object({ items: z.array(conditionRowSchema), canManage: z.boolean() })
  .strict();
export type ConditionRow = z.infer<typeof conditionRowSchema>;

export const supplierRowSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    type: z.string(),
    contactName: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    paymentTerms: z.string().nullable(),
    notes: z.string().nullable(),
    active: z.boolean(),
    batches: z.number().int(),
    totalSpentKobo: koboSchema,
    updatedAt: z.iso.datetime(),
    deleteCheck: deleteCheckSchema,
  })
  .strict();
export const supplierPageSchema = z
  .object({
    items: z.array(supplierRowSchema),
    nextCursor: z.string().nullable(),
    canManage: z.boolean(),
  })
  .strict();
export type SupplierRow = z.infer<typeof supplierRowSchema>;

export const brandRowSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    categories: z.array(z.object({ id: z.uuid(), name: z.string() }).strict()),
    lots: z.number().int(),
    updatedAt: z.iso.datetime(),
    deleteCheck: deleteCheckSchema,
  })
  .strict();
export const brandPageSchema = z
  .object({
    items: z.array(brandRowSchema),
    nextCursor: z.string().nullable(),
    canManage: z.boolean(),
  })
  .strict();
export type BrandRow = z.infer<typeof brandRowSchema>;

// What the Create lot form needs: categories with their effective defaults
// and fields, and open locations with bins that take new lots.
export const lotSetupOptionsSchema = z
  .object({
    categories: z.array(
      z
        .object({
          id: z.uuid(),
          parentId: z.uuid().nullable(),
          name: z.string(),
          path: z.string(),
          runTimeMinutes: z.number().int().nullable(),
          minStartPriceKobo: koboSchema.nullable(),
          minPhotos: z.number().int().nullable(),
          conditions: z.array(z.string()),
          fields: z.array(categoryFieldViewSchema),
        })
        .strict(),
    ),
    locations: z.array(
      z
        .object({
          id: z.uuid(),
          name: z.string(),
          code: z.string(),
          binRequiredToPublish: z.boolean(),
          bins: z.array(
            z
              .object({
                id: z.uuid(),
                code: z.string(),
                full: z.boolean(),
                held: z.number().int(),
                capacity: z.number().int().nullable(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
    brands: z.array(
      z
        .object({
          id: z.uuid(),
          name: z.string(),
          categoryIds: z.array(z.uuid()),
        })
        .strict(),
    ),
  })
  .strict();
export type LotSetupOptions = z.infer<typeof lotSetupOptionsSchema>;

export const lotSetupResultSchema = z
  .object({ id: z.uuid(), message: z.string() })
  .strict();

// Deleted items: setup items moved to the bin, who deleted them and when.
// Staff can restore them or delete them permanently (owner decision
// 2026-11-13; items stay until someone deletes them permanently).
export const lotSetupDeletedKinds = [
  'category',
  'location',
  'bin',
  'supplier',
  'brand',
] as const;
export type LotSetupDeletedKind = (typeof lotSetupDeletedKinds)[number];
export const lotSetupDeletionListSchema = z
  .object({
    search: z.string().trim().max(120).optional(),
    cursor: z.string().max(300).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();
export type LotSetupDeletionListInput = z.input<
  typeof lotSetupDeletionListSchema
>;
export const lotSetupDeletionSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(lotSetupDeletedKinds),
    name: z.string(),
    // Extra context, e.g. the location a bin belonged to.
    detail: z.string().nullable(),
    deletedBy: z.string(),
    deletedAt: z.iso.datetime(),
  })
  .strict();
export const lotSetupDeletionPageSchema = z
  .object({
    items: z.array(lotSetupDeletionSchema).max(50),
    nextCursor: z.string().nullable(),
    canManage: z.boolean(),
  })
  .strict();
export type LotSetupDeletion = z.infer<typeof lotSetupDeletionSchema>;
export const lotSetupTrashActionSchema = z
  .object({
    idempotencyKey: z.uuid(),
    kind: z.enum(lotSetupDeletedKinds),
    id: z.uuid(),
  })
  .strict();
export type LotSetupTrashActionInput = z.input<
  typeof lotSetupTrashActionSchema
>;
