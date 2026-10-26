'use client';
import { useEffect, useState } from 'react';
import { createSearchClient } from '@auction-ng/api-client/search';
import {
  BuyerPage,
  BuyerStack,
  Button,
  EmptyState,
  ErrorState,
  LotCardSkeleton,
} from '@auction-ng/ui/web';
import { apiUrl } from '../lib/session';
import { CatalogueGrid } from './catalogue-grid';
type Result = Awaited<
  ReturnType<ReturnType<typeof createSearchClient>['search']>
>;
export function SearchResults({ query }: { query: string }) {
  const [data, setData] = useState<Result>();
  const [error, setError] = useState(false);
  const [cursor, setCursor] = useState<string>();
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setData(undefined);
    setError(false);
    if (query)
      void createSearchClient(apiUrl)
        .search({ q: query, limit: 24, cursor })
        .then((value) => {
          if (active) setData(value);
        })
        .catch(() => {
          if (active) setError(true);
        });
    return () => {
      active = false;
    };
  }, [query, cursor, version]);
  return (
    <BuyerPage
      title={query ? `Search: ${query}` : 'Search auctions'}
      description="Search by item name using the search box above."
    >
      {!query ? (
        <EmptyState title="What are you looking for?">
          Try a brand, item name or category.
        </EmptyState>
      ) : error ? (
        <ErrorState onRetry={() => setVersion((value) => value + 1)} />
      ) : !data ? (
        <LotCardSkeleton />
      ) : (
        <BuyerStack>
          {data.items.length ? (
            <CatalogueGrid lots={data.items} />
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
