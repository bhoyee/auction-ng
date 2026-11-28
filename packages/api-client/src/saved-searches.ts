import {
  savedSearchAvailabilitySchema,
  savedSearchInputSchema,
  savedSearchPageSchema,
  savedSearchResultSchema,
  savedSearchSettingsSchema,
  savedSearchSummarySchema,
  savedSearchUpdateSchema,
  type SavedSearchInput,
} from '@auction-ng/shared/saved-search-schemas';
import { cataloguePageSchema } from '@auction-ng/shared/catalogue-schemas';
import { ApiError } from './auth';

async function call(url: URL, init: RequestInit) {
  const response = await fetch(url, {
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
    ...init,
  });
  if (!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<unknown>;
}

/** Public: whether to show "Save search & notify me". */
export async function savedSearchAvailability(baseUrl: string) {
  return savedSearchAvailabilitySchema.parse(
    await call(new URL('/saved-searches/availability', baseUrl), {}),
  );
}

/** A signed-in buyer's saved searches. */
export function createSavedSearchClient(
  baseUrl: string,
  credentials: { accessToken: string; deviceId: string },
) {
  const headers = {
    Authorization: `Bearer ${credentials.accessToken}`,
    'X-Device-Id': credentials.deviceId,
  };
  return {
    async list() {
      return savedSearchPageSchema.parse(
        await call(new URL('/buyers/saved-searches', baseUrl), { headers }),
      );
    },
    /** Saving the same search again returns the same one (created: false). */
    async save(input: SavedSearchInput) {
      return savedSearchResultSchema.parse(
        await call(new URL('/buyers/saved-searches', baseUrl), {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(savedSearchInputSchema.parse(input)),
        }),
      );
    },
    async remove(id: string) {
      await call(
        new URL(`/buyers/saved-searches/${encodeURIComponent(id)}`, baseUrl),
        { method: 'DELETE', headers },
      );
    },
    /** "Email me straight away" for one saved search (3 a day at most). */
    async setInstantEmail(id: string, instantEmail: boolean) {
      await call(
        new URL(`/buyers/saved-searches/${encodeURIComponent(id)}`, baseUrl),
        {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(savedSearchUpdateSchema.parse({ instantEmail })),
        },
      );
    },
    /** The daily digest email for all saved searches. */
    async setDigest(digest: boolean) {
      return savedSearchSettingsSchema.parse(
        await call(new URL('/buyers/saved-searches/settings', baseUrl), {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(savedSearchSettingsSchema.parse({ digest })),
        }),
      );
    },
    /** New matches across saved searches, for the account badge. */
    async summary() {
      return savedSearchSummarySchema.parse(
        await call(new URL('/buyers/saved-searches/summary', baseUrl), {
          headers,
        }),
      );
    },
    /** Clears one saved search's new-match count. */
    async viewed(id: string) {
      await call(
        new URL(
          `/buyers/saved-searches/${encodeURIComponent(id)}/viewed`,
          baseUrl,
        ),
        { method: 'POST', headers },
      );
    },
    /** Live items from new matches, for the homepage row. */
    async newItems(limit = 8) {
      const url = new URL('/buyers/saved-searches/new-items', baseUrl);
      url.searchParams.set('limit', String(limit));
      return cataloguePageSchema.parse(await call(url, { headers }));
    },
  };
}
