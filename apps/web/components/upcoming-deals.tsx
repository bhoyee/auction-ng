'use client';
import { useEffect, useState } from 'react';
import { readUpcomingDeals } from '@auction-ng/api-client/prebids';
type CataloguePage = Awaited<ReturnType<typeof readUpcomingDeals>>;
import { CalendarClock } from '@auction-ng/ui/web/icons';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { BuyerGrid } from '@auction-ng/ui/web/buyer-grids';
import { UpcomingCard } from '@auction-ng/ui/web/upcoming';
import { Button } from '@auction-ng/ui/web/button';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
import { Toast } from '@auction-ng/ui/web/toast';
import { apiUrl } from '../lib/session';
import { useServerClock } from '../lib/server-clock';
export function UpcomingDeals({ initial }: { initial?: CataloguePage }) {
  const [page, setPage] = useState(initial),
    [cursor, setCursor] = useState<string>(),
    [history, setHistory] = useState<(string | undefined)[]>([]),
    [error, setError] = useState(false),
    [version, setVersion] = useState(0);
  const now = useServerClock();
  useEffect(() => {
    let active = true,
      busy = false;
    const read = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const next = await readUpcomingDeals(apiUrl, cursor);
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
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', read);
      window.removeEventListener('online', read);
    };
  }, [cursor, version]);
  return (
    <BuyerPage
      title="UPCOMING DEALS"
      headingStyle="deals"
      headingIcon={<CalendarClock aria-hidden="true" strokeWidth={1.5} />}
      description="See what’s launching next. Set a private pre-bid limit or come back when bidding opens."
    >
      {error && (
        <Toast tone="error" onClose={() => setError(false)}>
          Upcoming deals could not be refreshed.{' '}
          <Button
            variant="secondary"
            size="small"
            onClick={() => setVersion((v) => v + 1)}
          >
            Retry
          </Button>
        </Toast>
      )}
      {!page && !error && <p role="status">Loading upcoming deals…</p>}
      {page?.items.length === 0 && (
        <EmptyState title="More deals are on the way">
          Scheduled auctions will appear here before bidding opens.{' '}
          <a href="/deals">Browse live auctions</a>
        </EmptyState>
      )}
      {page && (
        <BuyerGrid>
          {page.items.map((lot) => (
            <UpcomingCard key={lot.id} lot={lot} serverNow={now} />
          ))}
        </BuyerGrid>
      )}
      {page && (
        <div className="agn-prebid-actions">
          <Button
            variant="secondary"
            disabled={!history.length}
            onClick={() => {
              setCursor(history.at(-1));
              setHistory((h) => h.slice(0, -1));
              setPage(undefined);
            }}
          >
            Previous
          </Button>
          <Button
            disabled={!page.nextCursor}
            onClick={() => {
              setHistory((h) => [...h, cursor]);
              setCursor(page.nextCursor ?? undefined);
              setPage(undefined);
            }}
          >
            Next
          </Button>
        </div>
      )}
    </BuyerPage>
  );
}
