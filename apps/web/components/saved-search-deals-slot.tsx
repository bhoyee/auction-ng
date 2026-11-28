'use client';
import dynamic from 'next/dynamic';
import { useSavedSearchCount } from '../lib/saved-search-count';

// Loaded only for signed-in buyers who have new matches, after the page, so
// guests, most buyers and the homepage's first load never pay for it.
const SavedSearchDeals = dynamic(() => import('./saved-search-deals'), {
  ssr: false,
});

export function SavedSearchDealsSlot() {
  const count = useSavedSearchCount();
  return count ? <SavedSearchDeals /> : null;
}
