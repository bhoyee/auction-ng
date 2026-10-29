'use client';
import { useEffect, useState } from 'react';
import {
  dealEndBands,
  dealPriceBands,
  dealListInputSchema,
  type DealFilters,
  type DealPage,
} from '@auction-ng/shared';
import { formatNaira } from '@auction-ng/shared/money';
import { browseDeals } from '@auction-ng/api-client/deals';
import { CheckboxFilter, DealsHeading } from '@auction-ng/ui/web/deals-filters';
import { Button } from '@auction-ng/ui/web/button';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
import { ErrorState } from '@auction-ng/ui/web/error-state';
import { LotCardSkeleton } from '@auction-ng/ui/web/auction';
import { CatalogueGrid } from './catalogue-grid';
import { apiUrl } from '../lib/session';
const conditionOptions = [
  { value: 'new', label: 'New' },
  { value: 'like_new', label: 'Like new' },
  { value: 'open_box', label: 'Open box' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'untested', label: 'Untested' },
];
export function DealsListing({
  title,
  initialFilters,
  initial,
}: {
  title: string;
  initialFilters: DealFilters;
  initial?: DealPage;
}) {
  const [filters, setFilters] = useState(initialFilters),
    [version, setVersion] = useState(0);
  const key = JSON.stringify(filters);
  const [previous, setPrevious] = useState<(string | undefined)[]>([]);
  const [result, setResult] = useState<
    { key: string; page: DealPage } | undefined
  >(initial ? { key, page: initial } : undefined);
  const [error, setError] = useState(false);
  const page = result?.key === key ? result.page : undefined;
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const input = JSON.parse(key) as DealFilters;
          const params = new URLSearchParams();
          for (const group of ['prices', 'ends', 'conditions'] as const)
            if (input[group].length) params.set(group, input[group].join(','));
          if (input.cursor) params.set('cursor', input.cursor);
          window.history.replaceState(
            null,
            '',
            `${window.location.pathname}${params.size ? `?${params}` : ''}`,
          );
          let next = await browseDeals(
            apiUrl,
            { ...input, limit: 24 },
            controller.signal,
          );
          while (
            !next.items.length &&
            next.nextCursor &&
            !controller.signal.aborted
          ) {
            const following = await browseDeals(
              apiUrl,
              { ...input, limit: 24, cursor: next.nextCursor },
              controller.signal,
            );
            next = {
              ...following,
              unavailableLiveCount:
                next.unavailableLiveCount + following.unavailableLiveCount,
            };
          }
          if (!controller.signal.aborted) setResult({ key, page: next });
        } catch {
          if (!controller.signal.aborted) setError(true);
        }
      })();
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, version]);
  function update(group: 'prices' | 'ends' | 'conditions', values: string[]) {
    setPrevious([]);
    setFilters((previous) =>
      dealListInputSchema.parse({
        ...previous,
        cursor: undefined,
        [group]: values,
      }),
    );
  }
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) setVersion((value) => value + 1);
    };
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return (
    <main className="agn-container agn-deals-page">
      <DealsHeading title={title} section={filters.section} />
      <div className="agn-deals-filters" aria-label="Filter auctions">
        <CheckboxFilter
          label="Current bid"
          options={dealPriceBands.map((band) => ({
            value: band.id,
            label:
              band.max === null
                ? `${formatNaira(band.min)} and above`
                : band.min === 0
                  ? `Under ${formatNaira(band.max)}`
                  : `${formatNaira(band.min)} to under ${formatNaira(band.max)}`,
          }))}
          selected={filters.prices}
          onChange={(values) => update('prices', values)}
        />
        <CheckboxFilter
          label="Auction ends"
          options={dealEndBands.map((band) => ({
            value: band.id,
            label: band.label,
          }))}
          selected={filters.ends}
          onChange={(values) => update('ends', values)}
        />
        <CheckboxFilter
          label="Condition"
          options={conditionOptions}
          selected={filters.conditions}
          onChange={(values) => update('conditions', values)}
        />
        {filters.prices.length +
          filters.ends.length +
          filters.conditions.length >
          0 && (
          <Button
            variant="ghost"
            onClick={() => {
              setPrevious([]);
              setFilters((previous) => ({
                ...previous,
                prices: [],
                ends: [],
                conditions: [],
                cursor: undefined,
              }));
            }}
          >
            Clear filters
          </Button>
        )}
      </div>
      {error ? (
        <ErrorState
          title="Auctions could not be loaded"
          onRetry={() => setVersion((value) => value + 1)}
        />
      ) : !page ? (
        <>
          <p className="agn-deals-status" role="status">
            Updating auctions...
          </p>
          <LotCardSkeleton />
        </>
      ) : (
        <>
          {page.unavailableLiveCount > 0 && (
            <p className="agn-deals-status" role="status">
              Some auctions are waiting for live prices. Try refreshing the
              results.
            </p>
          )}
          {page.items.length ? (
            <CatalogueGrid
              lots={page.items}
              serverTime={page.serverTime}
              topDealsOnly={filters.section === 'top-deals'}
              dealFilters={filters}
            />
          ) : (
            <EmptyState
              title={
                page.unavailableLiveCount
                  ? 'Live prices are still reconnecting'
                  : 'No matching auctions'
              }
            >
              Try another combination or clear your filters.
            </EmptyState>
          )}
          <div className="agn-deals-pagination">
            {previous.length > 0 && (
              <Button
                variant="secondary"
                onClick={() => {
                  setFilters((value) => ({
                    ...value,
                    cursor: previous.at(-1),
                  }));
                  setPrevious((value) => value.slice(0, -1));
                }}
              >
                Previous page
              </Button>
            )}
            {page.nextCursor && (
              <Button
                variant="secondary"
                onClick={() => {
                  setPrevious((value) => [...value, filters.cursor]);
                  setFilters((value) => ({
                    ...value,
                    cursor: page.nextCursor ?? undefined,
                  }));
                }}
              >
                Next page
              </Button>
            )}
          </div>
        </>
      )}
    </main>
  );
}
