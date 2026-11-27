import {
  savedSearchAvailabilitySchema,
  savedSearchInputSchema,
  savedSearchPageSchema,
  savedSearchResultSchema,
  type SavedSearchInput,
} from '@auction-ng/shared/saved-search-schemas';
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
  };
}
