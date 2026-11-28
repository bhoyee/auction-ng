'use client';
import dynamic from 'next/dynamic';
import { useBuyer } from '../lib/session';

// Loaded only for signed-in buyers, after the page, so guests and the
// homepage's first load never pay for it.
const SavedSearchDeals = dynamic(() => import('./saved-search-deals'), {
  ssr: false,
});

export function SavedSearchDealsSlot() {
  const { tokens, ready } = useBuyer();
  return ready && tokens ? <SavedSearchDeals /> : null;
}
