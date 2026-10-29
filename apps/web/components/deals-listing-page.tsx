import { dealListQuerySchema, dealPageSchema } from '@auction-ng/shared';
import { DealsListing } from './deals-listing';
export async function DealsListingPage({
  section,
  title,
  categoryId,
  params,
}: {
  section: 'all' | 'top-deals' | 'ending-soon';
  title: string;
  categoryId?: string;
  params: Record<string, string | string[] | undefined>;
}) {
  const parsed = dealListQuerySchema.safeParse({
    ...params,
    section,
    categoryId,
    limit: '24',
  });
  const filters = parsed.success
    ? parsed.data
    : dealListQuerySchema.parse({ section, categoryId, limit: '24' });
  const url = new URL(
    '/browse-lots',
    process.env.API_INTERNAL_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      'http://localhost:4000',
  );
  for (const [key, value] of Object.entries(filters))
    if (
      value !== undefined &&
      (!Array.isArray(value) || value.length || key === 'conditions')
    )
      url.searchParams.set(key, String(value));
  let initial;
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) initial = dealPageSchema.parse(await response.json());
  } catch {
    /* The interactive page retains a retry action when the live read is unavailable. */
  }
  return (
    <DealsListing
      key={JSON.stringify(filters)}
      title={title}
      initialFilters={filters}
      initial={initial}
    />
  );
}
