'use client';
import { useEffect, useState } from 'react';
import { createSavedSearchClient } from '@auction-ng/api-client/saved-searches';
import { savedSearchRules } from '@auction-ng/shared/saved-search-schemas';
import { apiUrl, useBuyer } from '../lib/session';
import { SectionHeading } from '@auction-ng/ui/web/marketplace-sections';
import { ProductRail } from '@auction-ng/ui/web/product-rail';
import { CatalogueGrid } from './catalogue-grid';

type Deals = Awaited<
  ReturnType<ReturnType<typeof createSavedSearchClient>['newItems']>
>;

/**
 * "New for your saved searches": live items from new matches. Shows nothing
 * when there are none or the request fails; it's an extra, not the page.
 */
export default function SavedSearchDeals() {
  const { tokens, deviceId } = useBuyer();
  const [deals, setDeals] = useState<Deals>();
  const accessToken = tokens?.accessToken;
  useEffect(() => {
    if (!accessToken || !deviceId) return;
    let active = true;
    createSavedSearchClient(apiUrl, { accessToken, deviceId })
      .newItems(savedSearchRules.widgetItems)
      .then((value) => {
        if (active) setDeals(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [accessToken, deviceId]);
  if (!deals?.items.length) return null;
  return (
    <section
      className="agn-container agn-section agn-home-collection"
      aria-label="New for your saved searches"
    >
      <SectionHeading
        title="New for your saved searches"
        href="/saved-searches"
      />
      <ProductRail label="New for your saved searches">
        <CatalogueGrid lots={deals.items} serverTime={deals.serverTime} rail />
      </ProductRail>
    </section>
  );
}
