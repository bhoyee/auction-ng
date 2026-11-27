import { z } from 'zod';
import { searchRules } from './search-schemas';
import { searchKey } from './search-history';

/**
 * Saved searches (2026-11-27, search & retention step 2). A buyer saves a
 * search from the no-results page and is told when a matching deal is listed
 * (alerts arrive in step 3; until then SAVED_SEARCHES_ENABLED stays off).
 */
export const savedSearchRules = {
  /** Saved searches per buyer. */
  max: 20,
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
    createdAt: z.iso.datetime(),
  })
  .strict();
export const savedSearchPageSchema = z
  .object({
    enabled: z.boolean(),
    limit: z.number().int(),
    items: z.array(savedSearchSchema).max(savedSearchRules.max),
  })
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
