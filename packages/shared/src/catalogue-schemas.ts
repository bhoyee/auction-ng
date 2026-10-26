import { z } from 'zod';
import { lotNumberInputSchema } from './references';
import { databaseValues } from './database-values';
import { koboSchema, lotSchema } from './schemas';

export const imageRules = {
  maxUploadBytes: 8 * 1024 * 1024,
  maxPixels: 20_000_000,
  maxImages: 20,
  thumbnailWidth: 320,
  displayWidth: 960,
  maxThumbnailBytes: 30_000,
  uploadSeconds: 300,
  endingSoonMs: 60 * 60 * 1000,
} as const;
export const catalogueRules = {
  publicStatuses: ['scheduled', 'open', 'closing', 'closed'],
  browseStatuses: ['scheduled', 'open', 'closing'],
  endingSoonStatuses: ['open', 'closing'],
  editorRoles: ['admin', 'intake'],
} as const;
export const categorySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    parentId: z.uuid().nullable(),
  })
  .strict();
export const locationSchema = z
  .object({ id: z.uuid(), name: z.string(), code: z.string() })
  .strict();
export const catalogueImageSchema = z
  .object({
    id: z.uuid(),
    url: z.url(),
    thumbnailUrl: z.url(),
    sortOrder: z.number().int().min(0),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    thumbnailBytes: z
      .number()
      .int()
      .positive()
      .max(imageRules.maxThumbnailBytes),
  })
  .strict();
export const catalogueLotSchema = lotSchema.safeExtend({
  createdAt: z.iso.datetime(),
  lotNumber: z.string(),
  retailPriceKobo: koboSchema,
  category: categorySchema,
  location: locationSchema,
  thumbnail: catalogueImageSchema.nullable(),
  priceSource: z.literal('unavailable'),
});
export const catalogueDetailSchema = catalogueLotSchema.safeExtend({
  description: z.string(),
  images: z.array(catalogueImageSchema),
});
const cursor = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,2048}$/)
  .optional();
const limit = z.number().int().min(1).max(50).default(50);
export const pageInputSchema = z.object({ limit, cursor }).strict();
const integerQuery = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/)
  .transform(Number)
  .pipe(koboSchema);
export const pageQuerySchema = z
  .object({
    limit: integerQuery.pipe(z.number().min(1).max(50)).default(50),
    cursor,
  })
  .strict();
const filters = {
  categoryId: z.uuid().optional(),
  locationId: z.uuid().optional(),
  endingSoon: z.boolean().optional(),
  minPriceKobo: koboSchema.optional(),
  maxPriceKobo: koboSchema.optional(),
};
const priceRange = (value: { minPriceKobo?: number; maxPriceKobo?: number }) =>
  value.minPriceKobo === undefined ||
  value.maxPriceKobo === undefined ||
  value.minPriceKobo <= value.maxPriceKobo;
export const catalogueListInputSchema = pageInputSchema
  .extend(filters)
  .refine(priceRange, 'Minimum exceeds maximum.');
export const catalogueListQuerySchema = pageQuerySchema
  .extend({
    ...filters,
    endingSoon: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    minPriceKobo: integerQuery.optional(),
    maxPriceKobo: integerQuery.optional(),
  })
  .refine(priceRange, 'Minimum exceeds maximum.');
export const cataloguePageSchema = z
  .object({
    items: z.array(catalogueLotSchema).max(50),
    nextCursor: z.string().nullable(),
    serverTime: z.iso.datetime(),
  })
  .strict();
export const categoryPageSchema = z
  .object({
    items: z.array(categorySchema).max(50),
    nextCursor: z.string().nullable(),
  })
  .strict();
export const locationPageSchema = z
  .object({
    items: z.array(locationSchema).max(50),
    nextCursor: z.string().nullable(),
  })
  .strict();
const draftFields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(10_000),
  condition: z.enum(databaseValues.lotConditions),
  retailPriceKobo: koboSchema,
  startPriceKobo: koboSchema.refine((value) => value > 0),
  categoryId: z.uuid(),
  locationId: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
};
export const createLotInputSchema = z
  .object({
    ...draftFields,
    lotNumber: lotNumberInputSchema.optional(),
  })
  .strict()
  .refine(
    (value) => Date.parse(value.endsAt) > Date.parse(value.startsAt),
    'End must follow start.',
  );
export const editLotInputSchema = z
  .object(draftFields)
  .partial()
  .extend({ expectedUpdatedAt: z.iso.datetime() })
  .strict()
  .refine((value) => Object.keys(value).length > 1, 'Provide an edit.');
export const draftLotSchema = z
  .object({
    id: z.uuid(),
    lotNumber: z.string(),
    ...draftFields,
    status: z.literal('draft'),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const imageUploadInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    sizeBytes: z.number().int().positive().max(imageRules.maxUploadBytes),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    sortOrder: z
      .number()
      .int()
      .min(0)
      .max(imageRules.maxImages - 1),
  })
  .strict();
export const imageUploadSchema = z
  .object({
    uploadId: z.uuid(),
    uploadUrl: z.url(),
    expiresAt: z.iso.datetime(),
    headers: z
      .object({
        'Content-Type': z.string(),
        'x-amz-meta-sha256': z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
  })
  .strict();
export type CatalogueListInput = z.input<typeof catalogueListInputSchema>;
export type CatalogueList = z.output<typeof catalogueListInputSchema>;
export type PageInput = z.input<typeof pageInputSchema>;
export type CreateLotInput = z.infer<typeof createLotInputSchema>;
export type EditLotInput = z.infer<typeof editLotInputSchema>;
export type ImageUploadInput = z.infer<typeof imageUploadInputSchema>;
export type CatalogueImage = z.infer<typeof catalogueImageSchema>;
export type CatalogueLot = z.infer<typeof catalogueLotSchema>;
export type CatalogueDetail = z.infer<typeof catalogueDetailSchema>;
