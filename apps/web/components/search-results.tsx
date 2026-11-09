'use client';
import { useEffect, useState } from 'react';
import { createSearchClient } from '@auction-ng/api-client/search';
import { createCatalogueClient } from '@auction-ng/api-client';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { BuyerStack } from '@auction-ng/ui/web/buyer';
import { Button } from '@auction-ng/ui/web/button';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
import { ErrorState } from '@auction-ng/ui/web/error-state';
import { LotCardSkeleton } from '@auction-ng/ui/web/auction';
import { CatalogueFilters } from '@auction-ng/ui/web/marketplace-sections';
import { apiUrl } from '../lib/session';
import { CatalogueGrid } from './catalogue-grid';
type Result = Awaited<
  ReturnType<ReturnType<typeof createSearchClient>['search']>
>;
export function SearchResults({
  query,
  categories = [],
  locations = [],
  filters = {},
  invalidFilters = false,
}: {
  query: string;
  categories?: { id: string; name: string }[];
  locations?: { id: string; name: string }[];
  filters?: { categoryId?: string; locationId?: string; maxPriceKobo?: number };
  invalidFilters?: boolean;
}) {
  const [data, setData] = useState<Result>();
  const [error, setError] = useState(false);
  const [cursor, setCursor] = useState<string>();
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setData(undefined);
    setError(false);
    if (!invalidFilters)
      void (
        query
          ? createSearchClient(apiUrl).search({
              q: query,
              limit: 24,
              cursor,
              ...filters,
            })
          : createCatalogueClient(apiUrl).list({
              limit: 24,
              cursor,
              ...filters,
            })
      )
        .then((value) => {
          if (active) setData(value);
        })
        .catch(() => {
          if (active) setError(true);
        });
    return () => {
      active = false;
    };
  }, [
    query,
    invalidFilters,
    cursor,
    version,
    filters.categoryId,
    filters.locationId,
    filters.maxPriceKobo,
  ]);
  return (
    <BuyerPage
      title={query ? `Search: ${query}` : 'Search auctions'}
      description="Search by item name using the search box above."
    >
      <CatalogueFilters
        action="/search"
        categories={categories}
        locations={locations}
        categoryId={filters.categoryId}
        locationId={filters.locationId}
        maximum={
          filters.maxPriceKobo === undefined ? '' : String(filters.maxPriceKobo)
        }
        query={query}
      />
      {invalidFilters ? (
        <EmptyState
          title="Check your search filters"
          action={
            <a href={`/search?${new URLSearchParams({ q: query })}`}>
              Clear filters
            </a>
          }
        >
          Choose a category or pickup location from the list and try again.
        </EmptyState>
      ) : error ? (
        <ErrorState onRetry={() => setVersion((value) => value + 1)} />
      ) : !data ? (
        <LotCardSkeleton />
      ) : (
        <BuyerStack>
          {data.items.length ? (
            <CatalogueGrid lots={data.items} serverTime={data.serverTime} />
          ) : (
            <EmptyState title="No matching auctions">
              Try a shorter item name or browse another category.
            </EmptyState>
          )}
          {data.nextCursor && (
            <Button
              variant="secondary"
              onClick={() => setCursor(data.nextCursor ?? undefined)}
            >
              Next page
            </Button>
          )}
        </BuyerStack>
      )}
    </BuyerPage>
  );
}
