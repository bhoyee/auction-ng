import {
  searchInputSchema,
  searchPageSchema,
  type SearchInput,
} from '@auction-ng/shared/search-schemas';
import { ApiError } from './auth';

export function createSearchClient(baseUrl: string) {
  return {
    async search(input: SearchInput) {
      const parsed = searchInputSchema.parse(input);
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(parsed))
        if (value !== undefined) params.set(key, String(value));
      const response = await fetch(new URL(`/search?${params}`, baseUrl), {
        signal: AbortSignal.timeout(10000),
        cache: 'no-store',
      });
      if (!response.ok) throw new ApiError(response.status);
      return searchPageSchema.parse(await response.json());
    },
  };
}
