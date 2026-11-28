'use client';
import { useEffect, useState } from 'react';
import { createCatalogueClient } from '@auction-ng/api-client/catalogue';
import { PackageSearch } from '@auction-ng/ui/web/icons';
import { apiUrl } from '../lib/session';
import { CatalogueGrid } from './catalogue-grid';
import { SaveSearch, searchPath, type Filters } from './save-search';

type Lots = Awaited<
  ReturnType<ReturnType<typeof createCatalogueClient>['list']>
>;

/** Search found nothing: say so plainly and offer next steps. */
export function NoResults({
  query,
  filters,
  categories,
}: {
  query: string;
  filters: Filters;
  categories: { id: string; name: string }[];
}) {
  const [ending, setEnding] = useState<Lots>();
  const filtered =
    !!filters.categoryId ||
    !!filters.locationId ||
    filters.maxPriceKobo !== undefined;
  const shorter = query.split(/\s+/).slice(0, 2).join(' ');

  useEffect(() => {
    let active = true;
    createCatalogueClient(apiUrl)
      // Soonest-closing open deals, so the page always offers something.
      .list({ limit: 4 })
      .then((value) => {
        if (active) setEnding(value);
      })
      .catch(() => {
        // Optional extra; the page is complete without it.
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="agn-no-results">
      <section className="agn-state agn-no-results__panel">
        <PackageSearch size={28} strokeWidth={1.75} aria-hidden="true" />
        <h2>No deals for “{query}” right now</h2>
        <ul>
          <li>Check the spelling.</li>
          {shorter !== query && (
            <li>
              Try fewer words, for example{' '}
              <a href={searchPath(shorter, filters)}>{shorter}</a>.
            </li>
          )}
          {filtered && (
            <li>
              <a href={searchPath(query, {})}>Search without filters</a>.
            </li>
          )}
        </ul>
        <SaveSearch query={query} filters={filters} />
      </section>
      {categories.length > 0 && (
        <section aria-labelledby="no-results-categories">
          <h2 id="no-results-categories">Browse categories</h2>
          <ul className="agn-no-results__categories">
            {categories.slice(0, 8).map((category) => (
              <li key={category.id}>
                <a href={`/categories/${category.id}`}>{category.name}</a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {ending && ending.items.length > 0 && (
        <section aria-labelledby="no-results-ending">
          <h2 id="no-results-ending">Closing next</h2>
          <CatalogueGrid lots={ending.items} serverTime={ending.serverTime} />
        </section>
      )}
    </div>
  );
}
