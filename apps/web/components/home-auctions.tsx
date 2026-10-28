'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AuctionBrowseAction,
  ClosingBand,
  SectionHeading,
} from '@auction-ng/ui/web/marketplace-sections';
import { ProductRail } from '@auction-ng/ui/web/product-rail';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
import { BuyerLink } from '@auction-ng/ui/web/buyer';
import { apiUrl } from '../lib/session';
import { useServerClock } from '../lib/server-clock';
import { homeCollections } from '../lib/home-collections';
import { catalogueCards, type CardLot } from './catalogue-grid';
import { ClientCatalogueGrid } from './client-catalogue-grid';

export function HomeAuctions({
  initialLots,
  serverTime,
}: {
  initialLots: CardLot[];
  serverTime: string;
}) {
  const [lots, setLots] = useState(initialLots);
  const [unavailable, setUnavailable] = useState(false);
  const clock = useServerClock();
  const ends = useRef(new Map<string, string>());
  const streams = useRef(new Map<string, string>());
  const schedule = useRef<() => void>(() => {});
  useEffect(() => setLots(initialLots), [initialLots]);
  useEffect(() => {
    let active = true;
    let inFlight = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (!active || inFlight || document.hidden || !navigator.onLine) return;
      inFlight = true;
      try {
        const { createCatalogueClient } =
          await import('@auction-ng/api-client');
        const api = createCatalogueClient(apiUrl);
        const first = await api.list({ limit: 50 });
        const items = [...first.items];
        let cursor = first.nextCursor;
        for (let page = 1; cursor && page < 3; page++) {
          const next = await api.list({ limit: 50, cursor });
          items.push(...next.items);
          cursor = next.nextCursor;
        }
        const featured = await api.list({ limit: 50, topDeals: true });
        const merged = [
          ...new Map(
            [...items, ...featured.items].map((lot) => [lot.id, lot]),
          ).values(),
        ];
        if (active) {
          setLots(
            catalogueCards(merged).map((lot) => {
              const extension = ends.current.get(lot.id);
              return extension && Date.parse(extension) > Date.parse(lot.endsAt)
                ? { ...lot, endsAt: extension }
                : lot;
            }),
          );
          setUnavailable(false);
        }
      } catch {
        if (active) setUnavailable(true);
      } finally {
        inFlight = false;
      }
    };
    schedule.current = () => {
      if (debounce) return;
      debounce = setTimeout(() => {
        debounce = undefined;
        void refresh();
      }, 1000);
    };
    const update = () => {
      void refresh();
    };
    update();
    const timer = setInterval(update, 15000);
    window.addEventListener('focus', update);
    window.addEventListener('online', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      active = false;
      clearInterval(timer);
      clearTimeout(debounce);
      schedule.current = () => {};
      window.removeEventListener('focus', update);
      window.removeEventListener('online', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  const updateLot = useCallback(
    (id: string, endsAt: string, streamId: string) => {
      ends.current.set(id, endsAt);
      setLots((current) =>
        current.map((lot) =>
          lot.id === id && lot.endsAt !== endsAt ? { ...lot, endsAt } : lot,
        ),
      );
      if (streams.current.get(id) !== streamId) {
        streams.current.set(id, streamId);
        schedule.current();
      }
    },
    [],
  );
  const { closing, deals } = homeCollections(
    lots,
    clock || Date.parse(serverTime),
  );
  return (
    <>
      {closing.length > 0 && (
        <ClosingBand>
          <ProductRail label="Closing now lots">
            <ClientCatalogueGrid lots={closing} rail onLotUpdate={updateLot} />
          </ProductRail>
        </ClosingBand>
      )}
      {deals.length > 0 && (
        <section
          id="top-deals"
          className="agn-container agn-section agn-home-collection"
        >
          <SectionHeading title="Top Deals" href="/top-deals" />
          <ProductRail label="Top Deals">
            <ClientCatalogueGrid lots={deals} rail onLotUpdate={updateLot} />
          </ProductRail>
          <AuctionBrowseAction />
        </section>
      )}
      {!closing.length && !deals.length && (
        <section className="agn-container agn-section">
          <EmptyState
            title={
              unavailable
                ? 'Auctions could not be loaded'
                : 'Explore the latest auctions'
            }
            action={<BuyerLink href="/search">Browse all auctions</BuyerLink>}
          >
            Browse all open lots while our team selects the next Top Deals.
          </EmptyState>
        </section>
      )}
      {unavailable && lots.length > 0 && (
        <p className="agn-container agn-hint" role="status">
          Reconnecting to the auction catalogue…
        </p>
      )}
    </>
  );
}
