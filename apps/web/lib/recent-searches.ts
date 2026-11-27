'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  addRecentSearch,
  readRecentSearches,
  searchHistoryRules,
  searchKey,
} from '@auction-ng/shared/search-history';
import { apiUrl, useBuyer } from './session';

const CHANGED = 'giddydeal:recent-searches';

function readLocal(): string[] {
  try {
    return readRecentSearches(
      localStorage.getItem(searchHistoryRules.storageKey),
    );
  } catch {
    return [];
  }
}
function writeLocal(list: string[]) {
  try {
    if (list.length)
      localStorage.setItem(searchHistoryRules.storageKey, JSON.stringify(list));
    else localStorage.removeItem(searchHistoryRules.storageKey);
  } catch {
    // Private windows and blocked storage: recent searches just aren't kept.
  }
}
function changed() {
  window.dispatchEvent(new Event(CHANGED));
}

/**
 * Recent searches: in this browser for guests, on the account for signed-in
 * buyers (merged from the browser on sign-in). Failures never block search.
 */
export function useRecentSearches() {
  const { tokens, deviceId } = useBuyer();
  const accessToken = tokens?.accessToken;
  const [items, setItems] = useState<string[]>([]);
  // Read only once the search box is first used, not on every page load.
  const [wanted, setWanted] = useState(false);

  const client = useCallback(async () => {
    if (!accessToken) return null;
    const { createSearchHistoryClient } =
      await import('@auction-ng/api-client/search-history');
    return createSearchHistoryClient(apiUrl, { accessToken, deviceId });
  }, [accessToken, deviceId]);

  const refresh = useCallback(async () => {
    const local = readLocal();
    const remote = await client();
    if (!remote) return setItems(local);
    try {
      let history = await remote.list();
      if (history.enabled && local.length) {
        history = await remote.record(
          local.slice(0, searchHistoryRules.maxPerRequest),
        );
        writeLocal([]);
      }
      setItems(
        history.enabled ? history.items.map(({ query }) => query) : local,
      );
    } catch {
      setItems(local);
    }
  }, [client]);

  useEffect(() => {
    if (!wanted) return;
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(CHANGED, onChange);
    return () => window.removeEventListener(CHANGED, onChange);
  }, [refresh, wanted]);

  const update = useCallback(
    async (
      local: (list: string[]) => string[],
      remote: (
        api: NonNullable<Awaited<ReturnType<typeof client>>>,
      ) => Promise<{ enabled: boolean }>,
    ) => {
      const api = await client();
      if (api) {
        try {
          if ((await remote(api)).enabled) return changed();
        } catch {
          return; // Not saved this time; search itself is unaffected.
        }
      }
      // Guests, or accounts while the feature is switched off.
      writeLocal(local(readLocal()));
      changed();
    },
    [client],
  );

  return {
    items: items.slice(0, searchHistoryRules.shown),
    load: () => setWanted(true),
    record: (query: string) =>
      update(
        (list) => addRecentSearch(list, query),
        (api) => api.record([query]),
      ),
    remove: (query: string) =>
      update(
        (list) => list.filter((item) => searchKey(item) !== searchKey(query)),
        (api) => api.remove(query),
      ),
    clear: () =>
      update(
        () => [],
        (api) => api.clear(),
      ),
  };
}
