import { z } from 'zod';
import { conditionColours } from './conditions';
import { koboSchema } from './kobo-schema';
import { databaseValues } from './database-values';

// Lot setup (T15e): the lists every lot depends on. Changes apply to new
// lots only; existing lots keep their values unless a manager moves them.

export const RUN_TIME_OPTIONS_MINUTES = [360, 720, 1440, 2880, 4320] as const;
export const CATEGORY_MAX_DEPTH = 2;
export const BIN_RANGE_MAX = 100;
export const LOCATION_CODE_LENGTH = 3;

export function runTimeLabel(minutes: number) {
  return minutes % 60 === 0 ? `${minutes / 60} hours` : `${minutes} minutes`;
}

// "Phones & Tablets!" -> "phones-tablets". Empty when nothing usable is left.
export function slugify(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/g, '');
}

export const slugSchema = z
  .string()
  .trim()
  .min(2, 'Use at least 2 letters or numbers.')
  .max(120)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Use lowercase letters, numbers and single dashes only.',
  );

export const binCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, 'Enter a bin name or code.')
  .max(20, 'Keep bin names to 20 characters so they fit on the label.')
  .regex(
    /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/,
    'Use letters, numbers and single dashes only, e.g. S-06 or CAGE-2.',
  );

export type BinRangeResult =
  { ok: true; codes: string[] } | { ok: false; error: string };

// "S-" 6..10 -> S-06 ... S-10. Numbers are padded to at least two digits so
// labels sort naturally. Existing names stop the whole batch.
export function binRange(
  prefix: string,
  from: number,
  to: number,
  existing: readonly string[] = [],
): BinRangeResult {
  const start = prefix.trim().toUpperCase();
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0)
    return { ok: false, error: 'Use whole numbers from 0 upwards.' };
  if (to < from)
    return { ok: false, error: 'The second number must be the larger one.' };
  if (to - from + 1 > BIN_RANGE_MAX)
    return {
      ok: false,
      error: `Add up to ${BIN_RANGE_MAX} bins at a time.`,
    };
  const width = Math.max(2, String(to).length);
  const codes = Array.from(
    { length: to - from + 1 },
    (_, i) => start + String(from + i).padStart(width, '0'),
  );
  for (const code of codes) {
    const parsed = binCodeSchema.safeParse(code);
    if (!parsed.success)
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? 'Check the bin name.',
      };
  }
  const taken = new Set(existing.map((code) => code.toUpperCase()));
  const clash = codes.find((code) => taken.has(code));
  if (clash)
    return {
      ok: false,
      error: `${clash} already exists. Change the start of the name or the numbers.`,
    };
  return { ok: true, codes };
}

// A bin limit is optional; null means no limit.
export function binHasRoom(capacity: number | null, lots: number, adding = 1) {
  return capacity === null || lots + adding <= capacity;
}

export type BinStatus = 'in_use' | 'empty' | 'closed';
export function binStatus(bin: { acceptsNewLots: boolean; lots: number }) {
  if (!bin.acceptsNewLots) return 'closed' as const;
  return bin.lots > 0 ? ('in_use' as const) : ('empty' as const);
}

// A bin is full when the items still in it reach its capacity. Owner decision
// 2026-11-13: staff are warned, not blocked, when they use a full bin.
export function binIsFull(capacity: number | null, held: number) {
  return capacity !== null && held >= capacity;
}

// How full a bin is, for colour cues and filters. "Almost full" starts at
// 80% of the bin's limit; bins without a limit are never almost full or full.
export const BIN_ALMOST_FULL_PERCENT = 80;
export type BinFill = 'empty' | 'has_space' | 'almost_full' | 'full';
export function binFill(capacity: number | null, held: number): BinFill {
  if (binIsFull(capacity, held)) return 'full';
  if (held <= 0) return 'empty';
  if (capacity !== null && held * 100 >= capacity * BIN_ALMOST_FULL_PERCENT)
    return 'almost_full';
  return 'has_space';
}

// The single state staff see for a bin (colour, pill, filter): a bin that
// is not taking new lots shows that first, otherwise how full it is.
export type BinLook = BinFill | 'closed';
export function binLook(bin: {
  acceptsNewLots: boolean;
  capacity: number | null;
  lots: number;
}): BinLook {
  return bin.acceptsNewLots ? binFill(bin.capacity, bin.lots) : 'closed';
}
export const binLookLabels: Record<BinLook, string> = {
  empty: 'Empty',
  has_space: 'In use',
  almost_full: 'Almost full',
  full: 'Full',
  closed: 'Not for new lots',
};

export type LocationStatus = 'open' | 'opening' | 'closed';

// The "can this be deleted?" rule for every Lot setup record, with the safe
// alternative to offer when it cannot.
export type DeleteCheck =
  { allowed: true } | { allowed: false; reason: string; safeOption: string };

export function canDeleteCategory(c: { lots: number; children: number }) {
  if (c.lots > 0)
    return {
      allowed: false,
      reason: `Move its ${c.lots.toLocaleString('en-NG')} ${c.lots === 1 ? 'lot' : 'lots'} first.`,
      safeOption: 'move-lots',
    } satisfies DeleteCheck;
  if (c.children > 0)
    return {
      allowed: false,
      reason: 'Delete or move its subcategories first.',
      safeOption: 'hide',
    } satisfies DeleteCheck;
  return { allowed: true } satisfies DeleteCheck;
}

export function canDeleteLocation(l: { everHeldLots: boolean }) {
  return l.everHeldLots
    ? ({
        allowed: false,
        reason:
          'This location has held lots. Close it instead; existing lots stay.',
        safeOption: 'close',
      } satisfies DeleteCheck)
    : ({ allowed: true } satisfies DeleteCheck);
}

export function canDeleteBin(b: { lots: number }) {
  return b.lots > 0
    ? ({
        allowed: false,
        reason:
          'This bin still holds lots. Set it to "Not for new lots" instead.',
        safeOption: 'not-for-new-lots',
      } satisfies DeleteCheck)
    : ({ allowed: true } satisfies DeleteCheck);
}

// Conditions are a fixed list the buyer filters rely on: switch them off,
// never delete them.
export function canDeleteCondition() {
  return {
    allowed: false,
    reason: 'Conditions are used by buyer filters. Switch it off instead.',
    safeOption: 'switch-off',
  } satisfies DeleteCheck;
}

export function canDeleteSupplier(s: { batches: number }) {
  return s.batches > 0
    ? ({
        allowed: false,
        reason: 'This supplier has inventory batches. Deactivate it instead.',
        safeOption: 'deactivate',
      } satisfies DeleteCheck)
    : ({ allowed: true } satisfies DeleteCheck);
}

export function canDeleteBrand(b: { lots: number }) {
  return b.lots > 0
    ? ({
        allowed: false,
        reason: 'Lots use this brand. Merge it into another brand instead.',
        safeOption: 'merge',
      } satisfies DeleteCheck)
    : ({ allowed: true } satisfies DeleteCheck);
}

// ---- Schemas -------------------------------------------------------------

const command = { idempotencyKey: z.uuid() };
const version = { expectedUpdatedAt: z.iso.datetime().optional() };
const name = (max = 100) =>
  z.string().trim().min(2, 'Use at least 2 characters.').max(max);
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable();

export const lotSetupTabs = [
  'categories',
  'locations',
  'conditions',
  'suppliers',
  'brands',
] as const;
export type LotSetupTab = (typeof lotSetupTabs)[number];

// A pick-from-list field with this key takes its options from Lot setup ›
// Brands (the brands linked to the category), not from a typed list.
export const BRAND_FIELD_KEY = 'brand';

export const categoryFieldTypes = [
  'text',
  'list',
  'number',
  'boolean',
] as const;
export const categoryFieldTypeLabels: Record<
  (typeof categoryFieldTypes)[number],
  string
> = {
  text: 'Short text',
  list: 'Pick from list',
  number: 'Number',
  boolean: 'Yes / No',
};

export const categoryIcons = [
  'smartphone',
  'laptop',
  'cooking-pot',
  'monitor',
  'shirt',
  'sofa',
  'baby',
  'wrench',
  'tag',
] as const;

export const categoryFieldSchema = z
  .object({
    id: z.uuid().optional(),
    name: name(60),
    key: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/),
    type: z.enum(categoryFieldTypes),
    options: z.array(z.string().trim().min(1).max(60)).max(100).default([]),
    helpText: nullableText(160).default(null),
    required: z.boolean(),
    showToBuyers: z.boolean(),
  })
  .strict()
  .refine(
    (f) =>
      f.type !== 'list' || f.options.length > 0 || f.key === BRAND_FIELD_KEY,
    {
      message: 'Add at least one option for a pick-from-list field.',
      path: ['options'],
    },
  );
export type CategoryFieldInput = z.input<typeof categoryFieldSchema>;

export const categorySaveSchema = z
  .object({
    ...command,
    ...version,
    id: z.uuid().optional(),
    name: name(),
    slug: slugSchema,
    parentId: z.uuid().nullable(),
    description: nullableText(240),
    icon: z.enum(categoryIcons),
    // null = inherit from the parent category.
    defaultRunTimeMinutes: z
      .number()
      .int()
      .refine((v) => RUN_TIME_OPTIONS_MINUTES.some((o) => o === v))
      .nullable(),
    minStartPriceKobo: koboSchema.nullable(),
    minPhotos: z.number().int().min(0).max(20).nullable(),
    conditions: z.array(z.enum(databaseValues.lotConditions)).nullable(),
    // null = inherit the parent's fields; [] = no fields.
    fields: z.array(categoryFieldSchema).max(40).nullable(),
  })
  .strict();
export type CategorySaveInput = z.input<typeof categorySaveSchema>;

export const categoryOrderSchema = z
  .object({
    ...command,
    parentId: z.uuid().nullable(),
    ids: z.array(z.uuid()).min(1).max(200),
  })
  .strict();

export const categoryVisibilitySchema = z
  .object({ ...command, ...version, id: z.uuid(), visible: z.boolean() })
  .strict();

export const categoryMoveLotsSchema = z
  .object({ ...command, id: z.uuid(), targetId: z.uuid() })
  .strict()
  .refine((v) => v.id !== v.targetId, {
    message: 'Pick a different category.',
    path: ['targetId'],
  });

export const lotSetupDeleteSchema = z
  .object({ ...command, ...version, id: z.uuid() })
  .strict();

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const weekdays = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;
export const openingHoursSchema = z
  .object({
    day: z.enum([...weekdays, 'holiday']),
    opens: time.nullable(),
    closes: time.nullable(),
  })
  .strict()
  .refine(
    (h) =>
      (h.opens === null) === (h.closes === null) &&
      (h.opens === null || h.closes === null || h.opens < h.closes),
    { message: 'Closing time must be after opening time.' },
  );

export const locationSaveSchema = z
  .object({
    ...command,
    ...version,
    id: z.uuid().optional(),
    name: name(120),
    // Ignored: the server generates the short code on create and never
    // changes it (it is printed on bin labels). Kept optional for older clients.
    code: z.string().trim().max(3).optional(),
    address: z.string().trim().min(5).max(300),
    landmark: nullableText(160),
    phone: nullableText(20),
    // Owner decision 2026-11-13: map coordinates and pickup slots are not
    // asked for yet; existing values are kept when omitted.
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
    opensOn: z.iso.date().nullable(),
    // Owner decision 2026-11-09: free collection days are the same at every
    // location; only the storage fee per day is set per location.
    storageFeeKoboPerDay: koboSchema,
    slotMinutes: z.number().int().min(10).max(240).optional(),
    slotCapacity: z.number().int().min(1).max(10000).optional(),
    idRequired: z.boolean(),
    deliveryEnabled: z.boolean(),
    binRequiredToPublish: z.boolean(),
    hours: z.array(openingHoursSchema).length(8),
  })
  .strict();
export type LocationSaveInput = z.input<typeof locationSaveSchema>;

export const locationCloseSchema = z
  .object({ ...command, ...version, id: z.uuid(), closed: z.boolean() })
  .strict();

export const locationBinRuleSchema = z
  .object({
    ...command,
    ...version,
    id: z.uuid(),
    binRequiredToPublish: z.boolean(),
  })
  .strict();

export const locationStaffSchema = z
  .object({ ...command, id: z.uuid(), staffIds: z.array(z.uuid()).max(50) })
  .strict();

export const binSaveSchema = z
  .object({
    ...command,
    ...version,
    id: z.uuid().optional(),
    locationId: z.uuid(),
    code: binCodeSchema,
    note: nullableText(120),
    capacity: z.number().int().min(1).max(100000).nullable(),
    acceptsNewLots: z.boolean().default(true),
  })
  .strict();
export type BinSaveInput = z.input<typeof binSaveSchema>;

export const binBatchSchema = z
  .object({
    ...command,
    locationId: z.uuid(),
    prefix: z.string().trim().toUpperCase().max(12),
    from: z.number().int().min(0).max(99999),
    to: z.number().int().min(0).max(99999),
    note: nullableText(120),
    capacity: z.number().int().min(1).max(100000).nullable(),
  })
  .strict();

export const conditionSaveSchema = z
  .object({
    ...command,
    ...version,
    id: z.uuid(),
    label: name(40),
    meaning: z.string().trim().min(5).max(200),
    colour: z.enum(conditionColours),
    active: z.boolean(),
  })
  .strict();

export const conditionOrderSchema = z
  .object({ ...command, ids: z.array(z.uuid()).min(1).max(20) })
  .strict();

export const supplierTypes = [
  'marketplace_returns',
  'retailer',
  'individual',
] as const;
export const supplierTypeLabels: Record<
  (typeof supplierTypes)[number],
  string
> = {
  marketplace_returns: 'Marketplace returns',
  retailer: 'Retailer',
  individual: 'Individual',
};
export const supplierSaveSchema = z
  .object({
    ...command,
    ...version,
    id: z.uuid().optional(),
    name: name(120),
    type: z.enum(supplierTypes),
    contactName: nullableText(120),
    phone: nullableText(20),
    email: z
      .union([z.literal(''), z.email().max(200)])
      .transform((v) => (v === '' ? null : v))
      .nullable(),
    paymentTerms: nullableText(120),
    notes: nullableText(1000),
  })
  .strict();

export const activeToggleSchema = z
  .object({ ...command, ...version, id: z.uuid(), active: z.boolean() })
  .strict();

export const brandSaveSchema = z
  .object({
    ...command,
    ...version,
    id: z.uuid().optional(),
    name: name(80),
    categoryIds: z.array(z.uuid()).max(50),
  })
  .strict();

export const brandMergeSchema = z
  .object({ ...command, sourceId: z.uuid(), targetId: z.uuid() })
  .strict()
  .refine((v) => v.sourceId !== v.targetId, {
    message: 'Pick a different brand to merge into.',
    path: ['targetId'],
  });

export const lotSetupListSchema = z
  .object({
    search: z.string().trim().max(120).optional(),
    cursor: z.string().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(50),
  })
  .strict();

export const binListSchema = lotSetupListSchema.extend({
  status: z
    .enum(['all', 'in_use', 'empty', 'almost_full', 'full', 'closed'])
    .default('all'),
});

// Field-level error the admin shows next to the input.
export const LOT_SETUP_FIELD_ERROR = 'FIELD_ERROR';

// Input type of any Lot setup schema, for typed clients without zod.
export type LotSetupInput<T extends z.ZodType> = z.input<T>;
export type LotSetupSchema = z.ZodType;

// Location short codes are printed on bin labels (QR "LVBIN:<code>:<bin>"),
// so the system picks one when a location is created and never changes it.
// Prefer the initials, then letters from the name, then any free code.
export function suggestLocationCode(
  name: string,
  taken: ReadonlySet<string>,
): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const joined = words.join('');
  const consonants = joined.slice(1).replace(/[AEIOU]/g, '');
  const candidates: string[] = [];
  if (words.length >= 3)
    candidates.push(
      words
        .map((w) => w[0])
        .join('')
        .slice(0, 3),
    );
  if (words.length === 2) {
    const [a = '', b = ''] = words;
    candidates.push(`${a[0]}${b.slice(0, 2)}`, `${a.slice(0, 2)}${b[0]}`);
  }
  candidates.push(
    joined.slice(0, 3),
    `${joined[0] ?? ''}${consonants.slice(0, 2)}`,
  );
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const letter of alphabet)
    candidates.push(`${joined.slice(0, 2)}${letter}`);
  const first = joined[0] ?? 'L';
  for (const second of alphabet)
    for (const third of alphabet) candidates.push(`${first}${second}${third}`);
  for (const a of alphabet)
    for (const b of alphabet)
      for (const c of alphabet) candidates.push(`${a}${b}${c}`);
  const code = candidates.find(
    (candidate) => /^[A-Z]{3}$/.test(candidate) && !taken.has(candidate),
  );
  if (!code) throw new Error('Every 3-letter location code is in use.');
  return code;
}
