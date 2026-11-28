'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@auction-ng/ui/web/button';
import { BellRing } from '@auction-ng/ui/web/icons';
import { apiUrl, useBuyer } from '../lib/session';

export type Filters = {
  categoryId?: string;
  locationId?: string;
  maxPriceKobo?: number;
};
export function searchPath(query: string, filters: Filters, save = false) {
  const params = new URLSearchParams({ q: query });
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.locationId) params.set('locationId', filters.locationId);
  if (filters.maxPriceKobo !== undefined)
    params.set('maxPriceKobo', String(filters.maxPriceKobo));
  if (save) params.set('save', '1');
  return `/search?${params}`;
}

/**
 * "Save search & notify me", on search results and the no-results page.
 * Hidden while saved-search alerts are switched off.
 */
export function SaveSearch({
  query,
  filters,
}: {
  query: string;
  filters: Filters;
}) {
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
          is listed. <a href="/saved-searches">Manage saved searches</a>
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
