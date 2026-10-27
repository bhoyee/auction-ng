import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import {
  cataloguePageSchema,
  pastAuctionPageSchema,
  categoryPageSchema,
  locationPageSchema,
  catalogueDetailSchema,
  type CatalogueListInput,
} from '@auction-ng/shared';
const serverApi =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000';
async function publicRead<T>(
  path: string,
  schema: { parse: (value: unknown) => T },
  fresh = false,
): Promise<T> {
  const response = await fetch(new URL(path, serverApi), {
    headers: {
      'X-Catalogue-Cache-Namespace':
        process.env.CATALOGUE_CACHE_NAMESPACE || 'public-t13b',
    },
    ...(fresh ? { cache: 'no-store' as const } : { next: { revalidate: 30 } }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Catalogue unavailable');
  return schema.parse(await response.json());
}
export function publicLots(input: CatalogueListInput = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input))
    if (value !== undefined) query.set(key, String(value));
  return publicRead(`/lots?${query}`, cataloguePageSchema);
}
export function publicPastAuctions(cursor?: string) {
  const query = new URLSearchParams({ limit: '24' });
  if (cursor) query.set('cursor', cursor);
  return publicRead(`/past-auctions?${query}`, pastAuctionPageSchema, true);
}
export const publicCategories = () =>
  publicRead('/categories?limit=50', categoryPageSchema);
export const publicLocations = () =>
  publicRead('/locations?limit=50', locationPageSchema);
export const publicLot = (id: string) =>
  publicRead(`/lots/${encodeURIComponent(id)}`, catalogueDetailSchema);

// Three bounded keyset pages give the home rails variety without an unbounded API.
const cachedMarketplace = unstable_cache(
  async () => {
    const [categories, first] = await Promise.all([
      publicCategories(),
      publicLots({ limit: 50 }),
    ]);
    const items = [...first.items];
    let cursor = first.nextCursor;
    for (let page = 1; cursor && page < 3; page++) {
      const next = await publicLots({ limit: 50, cursor });
      items.push(...next.items);
      cursor = next.nextCursor;
    }
    return {
      items,
      categories: categories.items,
      serverTime: first.serverTime,
    };
  },
  [
    'buyer-marketplace-t13b',
    serverApi,
    process.env.CATALOGUE_CACHE_NAMESPACE || 'public-t13b',
  ],
  { revalidate: 30 },
);
export const publicMarketplace = cache(cachedMarketplace);
