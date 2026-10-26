import {
  cataloguePageSchema,
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
): Promise<T> {
  const response = await fetch(new URL(path, serverApi), {
    next: { revalidate: 30 },
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
export const publicCategories = () =>
  publicRead('/categories?limit=50', categoryPageSchema);
export const publicLocations = () =>
  publicRead('/locations?limit=50', locationPageSchema);
export const publicLot = (id: string) =>
  publicRead(`/lots/${encodeURIComponent(id)}`, catalogueDetailSchema);
