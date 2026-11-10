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
import { HomeUpcoming } from './home-upcoming';
import { apiUrl, useBuyer } from '../lib/session';
import { useServerClock } from '../lib/server-clock';
import { buyerHomeCollections, homeCollections } from '../lib/home-collections';
import { catalogueCards, type CardLot } from './catalogue-grid';
import { ClientCatalogueGrid } from './client-catalogue-grid';

export function HomeAuctions({
  initialLots,
  serverTime,
}: {
  initialLots: CardLot[];
  serverTime: string;
}) {
  const { tokens } = useBuyer();
  const signedIn = !!tokens;
  const [lots, setLots] = useState(initialLots);
  const [unavailable, setUnavailable] = useState(false);
  const clock = useServerClock();
  const ends = useRef(new Map<string, string>());
  const streams = useRef(new Map<string, string>());
  const frozen = useRef(
    new Map<string, { endsAt: string; pausedAt: number }>(),
  );
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
          await import('@auction-ng/api-client/catalogue');
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
    (id: string, endsAt: string, streamId: string, pausedAt?: number) => {
      if (pausedAt === undefined) frozen.current.delete(id);
      else frozen.current.set(id, { endsAt, pausedAt });
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
  const now = clock || Date.parse(serverTime);
  const visibleLots = lots.map((lot) => {
    const paused = frozen.current.get(lot.id);
    return paused
      ? {
          ...lot,
          endsAt: new Date(
            Date.parse(paused.endsAt) + Math.max(0, now - paused.pausedAt),
          ).toISOString(),
        }
      : lot;
  });
  const selected = signedIn
    ? buyerHomeCollections(visibleLots, now)
    : { ...homeCollections(visibleLots, now), ending: [] as CardLot[] };
  const { closing, deals, ending } = selected;
  return (
    <>
      {closing.length > 0 && (
        <ClosingBand>
          <ProductRail label="Closing now lots">
            <ClientCatalogueGrid lots={closing} rail onLotUpdate={updateLot} />
          </ProductRail>
        </ClosingBand>
      )}
      {signedIn && ending.length > 0 && (
        <section
          className="agn-container agn-section agn-home-collection"
          aria-label="Ending Soon"
        >
          <SectionHeading title="Ending Soon" href="/ending-soon" />
          <ClientCatalogueGrid
            lots={ending}
            columns={4}
            onLotUpdate={updateLot}
          />
        </section>
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
      {signedIn && <HomeUpcoming />}
      {!closing.length && !deals.length && !ending.length && (
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
