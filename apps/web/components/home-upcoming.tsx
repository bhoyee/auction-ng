'use client';
import { useEffect, useState } from 'react';
import { readUpcomingDeals } from '@auction-ng/api-client/prebids';
import { UpcomingCard } from '@auction-ng/ui/web/upcoming';
import { BuyerGrid } from '@auction-ng/ui/web/buyer-grids';
import { SectionHeading } from '@auction-ng/ui/web/marketplace-sections';
import { Button } from '@auction-ng/ui/web/button';
import { apiUrl } from '../lib/session';
import { useServerClock } from '../lib/server-clock';
type Page = Awaited<ReturnType<typeof readUpcomingDeals>>;
export function HomeUpcoming() {
  const [page, setPage] = useState<Page>();
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const now = useServerClock();
  useEffect(() => {
    let active = true,
      busy = false;
    const read = async () => {
      if (busy || document.hidden || !navigator.onLine) return;
      busy = true;
      try {
        const next = await readUpcomingDeals(apiUrl);
        if (active) {
          setPage(next);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      } finally {
        busy = false;
      }
    };
    void read();
    const timer = setInterval(() => void read(), 5000);
    window.addEventListener('focus', read);
    window.addEventListener('online', read);
    document.addEventListener('visibilitychange', read);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', read);
      window.removeEventListener('online', read);
      document.removeEventListener('visibilitychange', read);
    };
  }, [version]);
  const current = now || Date.parse(page?.serverTime ?? '');
  const lots =
    page?.items
      .filter(
        (lot) =>
          lot.status === 'scheduled' && Date.parse(lot.startsAt) > current,
      )
      .sort(
        (a, b) =>
          Date.parse(a.startsAt) - Date.parse(b.startsAt) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, 4) ?? [];
  if (!lots.length && !error) return null;
  return (
    <section
      className="agn-container agn-section agn-home-collection"
      aria-label="Upcoming Deals"
    >
      <SectionHeading title="Upcoming Deals" href="/upcoming-deals" />
      {error && (
        <p className="agn-detail-bid-notice" role="status">
          Upcoming deals could not be refreshed.{' '}
          <Button size="small" onClick={() => setVersion((v) => v + 1)}>
            Retry
          </Button>
        </p>
      )}
      <BuyerGrid columns={4}>
        {lots.map((lot) => (
          <UpcomingCard key={lot.id} lot={lot} serverNow={current} />
        ))}
      </BuyerGrid>
    </section>
  );
}
