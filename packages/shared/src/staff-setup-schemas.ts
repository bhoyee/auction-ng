import { z } from 'zod';
const command = {
  idempotencyKey: z.uuid(),
  reason: z.string().trim().min(5).max(1000),
};
export const staffSetupKindSchema = z.enum(['category', 'location']);
export const staffSetupQuerySchema = z
  .object({
    kind: staffSetupKindSchema,
    view: z.enum(['active', 'archived']).default('active'),
    search: z.string().trim().max(120).optional(),
    cursor: z.string().max(1000).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
const common = {
  ...command,
  id: z.uuid().optional(),
  expectedUpdatedAt: z.iso.datetime().optional(),
  name: z.string().trim().min(2).max(100),
};
export const staffCategorySaveSchema = z
  .object({
    ...common,
    kind: z.literal('category'),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    parentId: z.uuid().nullable().default(null),
  })
  .strict();
export const staffLocationSaveSchema = z
  .object({
    ...common,
    kind: z.literal('location'),
    code: z
      .string()
      .trim()
      .min(2)
      .max(32)
      .regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/),
    address: z.string().trim().min(5).max(1000),
    hours: z.string().trim().min(2).max(1000),
    capacityPerSlot: z.number().int().min(1).max(10000),
  })
  .strict();
export const staffSetupSaveSchema = z.discriminatedUnion('kind', [
  staffCategorySaveSchema,
  staffLocationSaveSchema,
]);
export const staffSetupArchiveSchema = z
  .object({
    ...command,
    kind: staffSetupKindSchema,
    id: z.uuid(),
    expectedUpdatedAt: z.iso.datetime(),
    operation: z.enum(['archive', 'restore', 'purge']),
  })
  .strict();
export const staffSetupRowSchema = z
  .object({
    id: z.uuid(),
    kind: staffSetupKindSchema,
    name: z.string(),
    key: z.string(),
    parentId: z.uuid().nullable(),
    address: z.string(),
    hours: z.string(),
    capacityPerSlot: z.number().int().nullable(),
    linkedLots: z.number().int().nonnegative(),
    currentItems: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe(
        'Recorded uncollected stock at this centre; superseded relists and collected item lines excluded.',
      ),
    pendingPickupItems: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe(
        'Paid pickup item lines not yet collected, including the remainder of partially collected orders.',
      ),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    archivedAt: z.iso.datetime().nullable(),
  })
  .strict();
export const staffSetupPageSchema = z
  .object({
    items: z.array(staffSetupRowSchema).max(50),
    nextCursor: z.string().nullable(),
  })
  .strict();
export const staffPreferencesSchema = z
  .object({
    compactTables: z.boolean().default(false),
    reduceMotion: z.boolean().default(false),
  })
  .strict();
export const staffPreferencesSaveSchema = z
  .object({ ...command, preferences: staffPreferencesSchema })
  .strict();
export const staffAuditDetailSchema = z
  .object({
    id: z.uuid(),
    actorId: z.uuid().nullable(),
    actorName: z.string(),
    action: z.string(),
    entityType: z.string(),
    entityId: z.string(),
    createdAt: z.iso.datetime(),
    before: z.string().nullable(),
    after: z.string().nullable(),
  })
  .strict();
export const staffPageSchema = z.enum([
  'overview',
  'inventory',
  'auctions',
  'pickup',
  'categories',
  'centres',
  'buyers',
  'support',
  'finance',
  'staff',
  'audit',
  'trash',
  'profile',
  'security',
  'preferences',
]);
export const staffPageVisitSchema = z
  .object({ idempotencyKey: z.uuid(), page: staffPageSchema })
  .strict();
export type StaffSetupRow = z.infer<typeof staffSetupRowSchema>;
export type StaffSetupQuery = z.input<typeof staffSetupQuerySchema>;
export type StaffSetupSave = z.input<typeof staffSetupSaveSchema>;
export type StaffSetupArchive = z.input<typeof staffSetupArchiveSchema>;
export type StaffPreferences = z.infer<typeof staffPreferencesSchema>;
export type StaffPage = z.infer<typeof staffPageSchema>;
export function staffInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? '';
  return (
    (
      first.slice(0, 1) +
      (parts.length > 1
        ? parts.at(-1)?.slice(0, 1)
        : first.length > 1
          ? first.slice(-1)
          : '')
    ).toLocaleUpperCase('en-NG') || 'LV'
  );
}
