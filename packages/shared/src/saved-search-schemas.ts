import { z } from 'zod';
import { searchRules } from './search-schemas';
import { searchKey } from './search-history';

/**
 * Saved searches (2026-11-27, search & retention step 2) and their alerts
 * (2026-11-28, step 3). A new live item that matches a saved search gives an
 * in-app alert straight away; emails go out in one daily digest, or straight
 * away for searches the buyer chose, up to a daily cap.
 */
export const savedSearchRules = {
  /** Saved searches per buyer. */
  max: 20,
  /** "Email me straight away" emails per buyer per WAT day. */
  instantPerDay: 3,
  /** The daily digest goes out from this WAT hour. */
  digestHourWat: 8,
  /** Items listed in one alert email. */
  emailItems: 6,
  /** Items in the homepage "New for your saved searches" row. */
  widgetItems: 8,
  /** Lots checked per scan, and saved searches per Meilisearch request. */
  scanLots: 200,
  searchesPerRequest: 100,
  /** Digests built per delivery run. */
  digestBuyers: 50,
} as const;

const query = z.string().trim().min(1).max(searchRules.maxQueryLength);
const kobo = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const savedSearchInputSchema = z
  .object({
    query,
    categoryId: z.uuid().optional(),
    locationId: z.uuid().optional(),
    maxPriceKobo: kobo.optional(),
  })
  .strict();
export const savedSearchSchema = z
  .object({
    id: z.uuid(),
    query,
    categoryId: z.uuid().nullable(),
    locationId: z.uuid().nullable(),
    maxPriceKobo: kobo.nullable(),
    instantEmail: z.boolean(),
    newMatches: z.number().int().nonnegative(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const savedSearchPageSchema = z
  .object({
    enabled: z.boolean(),
    limit: z.number().int(),
    digest: z.boolean(),
    items: z.array(savedSearchSchema).max(savedSearchRules.max),
  })
  .strict();
export const savedSearchUpdateSchema = z
  .object({ instantEmail: z.boolean() })
  .strict();
export const savedSearchSettingsSchema = z
  .object({ digest: z.boolean() })
  .strict();
export const savedSearchSummarySchema = z
  .object({ newMatches: z.number().int().nonnegative() })
  .strict();
export const savedSearchResultSchema = z
  .object({ id: z.uuid(), created: z.boolean() })
  .strict();
export const savedSearchAvailabilitySchema = z
  .object({ enabled: z.boolean() })
  .strict();
export type SavedSearchInput = z.input<typeof savedSearchInputSchema>;

/** The same search with the same filters is saved only once. */
export function savedSearchKey(input: z.output<typeof savedSearchInputSchema>) {
  return [
    searchKey(input.query),
    input.categoryId ?? '',
    input.locationId ?? '',
    input.maxPriceKobo ?? '',
  ].join('|');
}

/** The search page address for a saved search, used by alerts and pages. */
export function savedSearchPath(search: {
  query: string;
  categoryId?: string | null;
  locationId?: string | null;
  maxPriceKobo?: number | null;
}) {
  const params = new URLSearchParams({ q: search.query });
  if (search.categoryId) params.set('categoryId', search.categoryId);
  if (search.locationId) params.set('locationId', search.locationId);
  if (search.maxPriceKobo != null)
    params.set('maxPriceKobo', String(search.maxPriceKobo));
  return `/search?${params}`;
}
