import {
  searchHistoryRecordSchema,
  searchHistoryRemoveSchema,
  searchHistorySchema,
} from '@auction-ng/shared/search-history-schemas';
import { ApiError } from './auth';

/** A signed-in buyer's recent searches (newest first). */
export function createSearchHistoryClient(
  baseUrl: string,
  credentials: { accessToken: string; deviceId: string },
) {
  async function request(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ) {
    const response = await fetch(
      new URL(`/buyers/search-history${path}`, baseUrl),
      {
        method,
        cache: 'no-store',
        redirect: 'error',
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          Authorization: `Bearer ${credentials.accessToken}`,
          'X-Device-Id': credentials.deviceId,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) throw new ApiError(response.status);
    return searchHistorySchema.parse(await response.json());
  }
  return {
    list: () => request('GET', ''),
    /** Newest first: one new search, or the browser list after sign-in. */
    record: (queries: string[]) =>
      request('POST', '', searchHistoryRecordSchema.parse({ queries })),
    remove: (query: string) =>
      request('POST', '/remove', searchHistoryRemoveSchema.parse({ query })),
    clear: () => request('DELETE', ''),
  };
}
