'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCatalogueClient } from '@auction-ng/api-client/catalogue';
import { Button } from '@auction-ng/ui/web/button';
import { BellRing, PackageSearch } from '@auction-ng/ui/web/icons';
import { apiUrl, useBuyer } from '../lib/session';
import { CatalogueGrid } from './catalogue-grid';

type Filters = {
  categoryId?: string;
  locationId?: string;
  maxPriceKobo?: number;
};
type Lots = Awaited<
  ReturnType<ReturnType<typeof createCatalogueClient>['list']>
>;

function searchPath(query: string, filters: Filters, save = false) {
  const params = new URLSearchParams({ q: query });
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.locationId) params.set('locationId', filters.locationId);
  if (filters.maxPriceKobo !== undefined)
    params.set('maxPriceKobo', String(filters.maxPriceKobo));
  if (save) params.set('save', '1');
  return `/search?${params}`;
}

/** "Save search & notify me". Hidden until saved-search alerts are live. */
function SaveSearch({ query, filters }: { query: string; filters: Filters }) {
  const { tokens, deviceId, ready } = useBuyer();
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<
    'idle' | 'saving' | 'saved' | 'error' | 'full'
  >('idle');
  const [savedId, setSavedId] = useState<string>();
  const autoSaved = useRef(false);

  useEffect(() => {
    let active = true;
    void import('@auction-ng/api-client/saved-searches')
      .then(({ savedSearchAvailability }) => savedSearchAvailability(apiUrl))
      .then((value) => {
        if (active) setEnabled(value.enabled);
      })
      .catch(() => {
        // Unknown: keep the button hidden rather than promise an alert.
      });
    return () => {
      active = false;
    };
  }, []);

  const save = async () => {
    if (!tokens) return;
    setState('saving');
    try {
      const { createSavedSearchClient } =
        await import('@auction-ng/api-client/saved-searches');
      const result = await createSavedSearchClient(apiUrl, {
        accessToken: tokens.accessToken,
        deviceId,
      }).save({ query, ...filters });
      setSavedId(result.id);
      setState('saved');
    } catch (error) {
      setState(
        (error as { status?: number }).status === 409 ? 'full' : 'error',
      );
    }
  };
  const undo = async () => {
    if (!tokens || !savedId) return;
    try {
      const { createSavedSearchClient } =
        await import('@auction-ng/api-client/saved-searches');
      await createSavedSearchClient(apiUrl, {
        accessToken: tokens.accessToken,
        deviceId,
      }).remove(savedId);
      setSavedId(undefined);
      setState('idle');
    } catch {
      setState('error');
    }
  };

  // Back from sign-in with ?save=1: save once, then tidy the address.
  useEffect(() => {
    if (!enabled || !ready || !tokens || autoSaved.current) return;
    if (new URLSearchParams(window.location.search).get('save') !== '1') return;
    autoSaved.current = true;
    router.replace(searchPath(query, filters));
    void save();
    // save() reads the latest tokens; running once per return is intended.
  }, [enabled, ready, tokens]);

  if (!enabled) return null;
  if (state === 'saved')
    return (
      <div className="agn-no-results__saved" role="status">
        <p>
          <strong>Search saved.</strong> We’ll let you know when a matching deal
          is listed.
        </p>
        <button type="button" onClick={() => void undo()}>
          Undo
        </button>
      </div>
    );
  return (
    <div className="agn-no-results__save">
      {ready && !tokens ? (
        <>
          <a
            className="agn-button agn-button--primary"
            href={`/sign-in?${new URLSearchParams({ next: searchPath(query, filters, true) })}`}
          >
            <BellRing size={18} aria-hidden="true" />
            Save search &amp; notify me
          </a>
          <p>Sign in or create an account to get alerts for this search.</p>
        </>
      ) : (
        <Button
          variant="primary"
          disabled={!ready || state === 'saving'}
          onClick={() => void save()}
        >
          <BellRing size={18} aria-hidden="true" />
          {state === 'saving' ? 'Saving…' : 'Save search & notify me'}
        </Button>
      )}
      {state === 'full' && (
        <p role="alert">
          You already have 20 saved searches. Remove one to save this search.
        </p>
      )}
      {state === 'error' && (
        <p role="alert">
          We couldn’t save your search. Check your connection and try again.
        </p>
      )}
    </div>
  );
}

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
