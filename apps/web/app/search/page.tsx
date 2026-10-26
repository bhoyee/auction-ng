import { SearchResults } from '../../components/search-results';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = (await searchParams).q;
  return (
    <SearchResults
      query={typeof query === 'string' ? query.slice(0, 120).trim() : ''}
    />
  );
}
