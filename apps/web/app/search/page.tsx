import { SearchResults } from '../../components/search-results';
import { publicCategories, publicLocations } from '../../lib/catalogue';
import { catalogueListQuerySchema } from '@auction-ng/shared/catalogue-schemas';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = params.q;
  const [categories, locations] = await Promise.all([
    publicCategories().catch(() => null),
    publicLocations().catch(() => null),
  ]);
  const input = catalogueListQuerySchema.safeParse(
    Object.fromEntries(
      ['categoryId', 'locationId', 'maxPriceKobo'].flatMap((key) =>
        typeof params[key] === 'string' && params[key]
          ? [[key, params[key]]]
          : [],
      ),
    ),
  );
  const filters = input.success
    ? {
        categoryId: input.data.categoryId,
        locationId: input.data.locationId,
        maxPriceKobo: input.data.maxPriceKobo,
      }
    : {};
  return (
    <SearchResults
      key={JSON.stringify([query, filters])}
      invalidFilters={!input.success}
      query={typeof query === 'string' ? query.slice(0, 120).trim() : ''}
      categories={categories?.items}
      locations={locations?.items}
      filters={filters}
    />
  );
}
