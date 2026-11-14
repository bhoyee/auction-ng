'use client';
import { useEffect, useRef, useState } from 'react';
import {
  readComingSoonDeals,
  readUpcomingDeals,
} from '@auction-ng/api-client/prebids';
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
    // Quiet background refresh: keep what is shown, note it is reconnecting.
    [stale, setStale] = useState(false),
    [version, setVersion] = useState(0);
  const now = useServerClock();
  const shown = useRef(page);
  shown.current = page;
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
          setStale(false);
        }
      } catch {
        if (!active) return;
        // Only an empty page shows the error; otherwise keep the deals shown.
        if (shown.current) setStale(true);
        else setError(true);
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
      {stale && page && (
        <p className="agn-deals-status" role="status">
          Reconnecting… showing the latest deals we have.
        </p>
      )}
      {error && !page && (
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
      <ComingSoonDeals now={now} />
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

/**
 * Lots announced without a date (owner decision 2026-11-14): buyers can view
 * and watch them; pre-bids open once staff set a go-live time.
 */
function ComingSoonDeals({ now }: { now: number }) {
  const [page, setPage] = useState<CataloguePage>();
  useEffect(() => {
    let active = true;
    const read = () => {
      if (document.hidden) return;
      readComingSoonDeals(apiUrl)
        .then((next) => active && setPage(next))
        .catch(() => undefined);
    };
    read();
    const timer = setInterval(read, 30000);
    window.addEventListener('focus', read);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', read);
    };
  }, []);
  if (!page?.items.length) return null;
  return (
    <section aria-labelledby="coming-soon-title">
      <h2 id="coming-soon-title" className="agn-upcoming-section-title">
        Date to be announced
      </h2>
      <p className="agn-upcoming-section-note">
        Watch these to get an alert as soon as bidding is scheduled.
      </p>
      <BuyerGrid>
        {page.items.map((lot) => (
          <UpcomingCard key={lot.id} lot={lot} serverNow={now} />
        ))}
      </BuyerGrid>
    </section>
  );
}
