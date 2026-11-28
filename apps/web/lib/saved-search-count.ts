'use client';
import { useEffect, useState } from 'react';
import { apiUrl, useBuyer } from './session';

/** Fired by the saved-searches page after a change, to refresh the badge. */
export const SAVED_SEARCHES_CHANGED = 'auction-ng-saved-searches-change';

/**
 * New saved-search matches for the account badge. Plain fetch, no schema
 * library: this runs in the shell on every page, so it stays tiny.
 */
export function useSavedSearchCount() {
  const { tokens, deviceId } = useBuyer();
  const userId = tokens?.user.id;
  const accessToken = tokens?.accessToken;
  const [snapshot, setSnapshot] = useState<{ userId: string; count: number }>();
  useEffect(() => {
    let active = true;
    setSnapshot(undefined);
    if (!userId || !accessToken || !deviceId) return;
    const refresh = async () => {
      if (document.visibilityState === 'hidden' || !navigator.onLine) return;
      try {
        const response = await fetch(
          new URL('/buyers/saved-searches/summary', apiUrl),
          {
            cache: 'no-store',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'X-Device-Id': deviceId,
            },
            signal: AbortSignal.timeout(10000),
          },
        );
        if (!response.ok) return;
        const body: unknown = await response.json();
        const count =
          body && typeof body === 'object' && 'newMatches' in body
            ? body.newMatches
            : undefined;
        if (active && typeof count === 'number' && Number.isSafeInteger(count))
          setSnapshot({ userId, count });
      } catch {
        /* The badge is a hint; it stays as it was until the next refresh. */
      }
    };
    const refreshNow = () => void refresh();
    void refresh();
    const interval = window.setInterval(refreshNow, 60000);
    window.addEventListener(SAVED_SEARCHES_CHANGED, refreshNow);
    window.addEventListener('focus', refreshNow);
    window.addEventListener('online', refreshNow);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener(SAVED_SEARCHES_CHANGED, refreshNow);
      window.removeEventListener('focus', refreshNow);
      window.removeEventListener('online', refreshNow);
    };
  }, [userId, accessToken, deviceId]);
  return userId && snapshot?.userId === userId ? snapshot.count : undefined;
}
