'use client';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useRouter } from 'next/navigation';
import { createBuyerClient } from '@auction-ng/api-client/buyers';
import { createUseLiveLot } from '@auction-ng/api-client/realtime-hook';
import type { RealtimeClient } from '@auction-ng/api-client/realtime';
import type { WatchActivityPage } from '@auction-ng/shared/buyer-schemas';
import { minNextBid } from '@auction-ng/shared/auction-rules';
import { formatNaira } from '@auction-ng/shared/money';
import { Button } from '@auction-ng/ui/web/button';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { BuyerSkeleton } from '@auction-ng/ui/web/buyer';
import {
  WatchlistCard,
  WatchlistLayout,
  WatchlistPagination,
} from '@auction-ng/ui/web/watchlist';
import { NairaInput } from '@auction-ng/ui/web/naira-input';
import { Countdown } from '@auction-ng/ui/web/auction';
import { Tabs } from '@auction-ng/ui/web/tabs';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
import { ErrorState } from '@auction-ng/ui/web/error-state';
import { apiUrl, useBuyer } from '../lib/session';
import { useBuyerRealtime } from '../lib/buyer-realtime';
import { useOnline } from '../lib/network';

const useLiveLot = createUseLiveLot({ useEffect, useSyncExternalStore });
type View = 'watching' | 'won' | 'lost';
type Entry = WatchActivityPage['items'][number];
const labels = {
  won: 'Won',
  lost: 'Sold to another buyer',
  unsold: 'Ended unsold',
  pending: 'Ended · confirming result',
  watching: 'Watching',
};
function WatchRow({
  item,
  client,
  now,
  onRemove,
  busy,
  onExpired,
}: {
  item: Entry;
  client: RealtimeClient;
  now: number;
  onRemove: () => void;
  busy: boolean;
  onExpired: () => void;
}) {
  const live = useLiveLot(client, item.id);
  const online = useOnline();
  const router = useRouter();
  const [amount, setAmount] = useState<number>();
  const active = item.outcome === 'watching';
  const connected = online && live.status === 'live' && live.lot !== null;
  const endsAt = Date.parse(live.lot?.endsAt ?? item.endsAt);
  const serverNow = now + live.clockOffsetMs;
  const expired = now > 0 && connected && serverNow >= endsAt;
  const reported = useRef(false);
  useEffect(() => {
    if (expired && !reported.current) {
      reported.current = true;
      onExpired();
    }
    if (!expired) reported.current = false;
  }, [expired, onExpired]);
  const price = active
    ? connected
      ? (live.lot?.currentPriceKobo ?? item.startPriceKobo)
      : null
    : item.finalPriceKobo;
  const minimum = minNextBid(
    item.startPriceKobo,
    live.lot?.currentPriceKobo ?? null,
  );
  const open = active && connected && !expired;
  return (
    <WatchlistCard
      title={item.title}
      href={`/lots/${item.id}`}
      image={item.thumbnailUrl}
      action={
        <Button
          variant="danger"
          busy={busy}
          onClick={onRemove}
          aria-label={`Unwatch ${item.title}`}
        >
          Unwatch
        </Button>
      }
      price={
        <>
          {price !== null ? (
            <strong>{formatNaira(price)}</strong>
          ) : (
            <span>
              {active
                ? 'Reconnecting to live price…'
                : 'Final price unavailable'}
            </span>
          )}
          {price !== null && item.retailPriceKobo > price && (
            <s
              aria-label={`Retail estimate ${formatNaira(item.retailPriceKobo)}`}
            >
              {formatNaira(item.retailPriceKobo)}
            </s>
          )}
        </>
      }
      timer={
        active ? (
          expired ? (
            'Bidding ended · confirming result'
          ) : (
            <>
              <span>Bidding ends: </span>
              <Countdown
                endsAt={endsAt}
                serverNow={serverNow}
                live={connected && now > 0}
                showSeconds
              />
            </>
          )
        ) : (
          labels[item.outcome]
        )
      }
      locationName={item.locationName}
      locationAddress={item.locationAddress}
    >
      {active ? (
        <>
          <NairaInput
            label="Your bid (₦)"
            onAmountChange={setAmount}
            placeholder={formatNaira(minimum)}
            disabled={!open || busy}
          />
          <Button
            disabled={!open || busy || amount === undefined || amount < minimum}
            onClick={() =>
              router.push(`/lots/${item.id}?bid=1&amountKobo=${amount}`)
            }
          >
            Bid now
          </Button>
          <p>
            {open
              ? `Minimum ${formatNaira(minimum)}. Review fees before confirming.`
              : 'Bidding is unavailable until the live auction is confirmed.'}
          </p>
        </>
      ) : null}
    </WatchlistCard>
  );
}
export function Watchlist() {
  const session = useBuyer();
  const client = useBuyerRealtime();
  const online = useOnline();
  const [view, setView] = useState<View>('watching');
  const [pageCursors, setPageCursors] = useState<(string | undefined)[]>([
    undefined,
  ]);
  const cursor = pageCursors.at(-1);
  const [snapshot, setSnapshot] = useState<{
    owner: string;
    view: View;
    cursor?: string;
    data: WatchActivityPage;
  }>();
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<string>();
  const [version, setVersion] = useState(0);
  const [now, setNow] = useState(0);
  const revision = useRef(0);
  const currentSession = useRef(session);
  currentSession.current = session;
  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  const owner = session.tokens?.user.id;
  const data =
    snapshot?.owner === owner &&
    snapshot?.view === view &&
    snapshot?.cursor === cursor
      ? snapshot.data
      : undefined;
  useEffect(() => {
    let active = true;
    const requestRevision = revision.current;
    if (!session.tokens) return;
    const tokens = session.tokens;
    void createBuyerClient(apiUrl, {
      accessToken: session.tokens.accessToken,
      deviceId: session.deviceId,
    })
      .watchActivity(view, { limit: 10, cursor })
      .then((value) => {
        if (active && requestRevision === revision.current) {
          setSnapshot({
            owner: tokens.user.id,
            view,
            cursor,
            data: value,
          });
          setError('');
        }
      })
      .catch(() => {
        if (active) {
          setSnapshot(undefined);
          setError('We could not load your watchlist. Please try again.');
        }
      });
    return () => {
      active = false;
    };
  }, [session.tokens, session.deviceId, view, cursor, version]);
  useEffect(() => {
    setNow(Date.now());
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const reconcile = () => {
      if (!document.hidden && navigator.onLine) refresh();
    };
    const timer = setInterval(reconcile, 15000);
    window.addEventListener('focus', reconcile);
    window.addEventListener('online', reconcile);
    document.addEventListener('visibilitychange', reconcile);
    window.addEventListener('auction-ng-watchlist-change', reconcile);
    return () => {
      clearInterval(clock);
      clearInterval(timer);
      window.removeEventListener('focus', reconcile);
      window.removeEventListener('online', reconcile);
      document.removeEventListener('visibilitychange', reconcile);
      window.removeEventListener('auction-ng-watchlist-change', reconcile);
    };
  }, [refresh]);
  async function remove(item: Entry) {
    if (!session.tokens || removing) return;
    const userId = session.tokens.user.id;
    setRemoving(item.id);
    try {
      await createBuyerClient(apiUrl, {
        accessToken: session.tokens.accessToken,
        deviceId: session.deviceId,
      }).watch(item.id, false);
      if (currentSession.current.tokens?.user.id !== userId) return;
      revision.current++;
      setSnapshot((value) =>
        value?.owner === userId
          ? {
              ...value,
              data: {
                ...value.data,
                items: value.data.items.filter((row) => row.id !== item.id),
              },
            }
          : value,
      );
      window.dispatchEvent(
        new CustomEvent('auction-ng-watchlist-change', {
          detail: { userId, lotId: item.id, watching: false },
        }),
      );
      refresh();
    } catch {
      if (currentSession.current.tokens?.user.id === userId)
        setError('We could not unwatch this item. Reconnect and try again.');
    } finally {
      setRemoving(undefined);
    }
  }
  const panel = (
    <>
      {!online && (
        <p role="status">
          You’re offline. Reconnect for live prices and bidding.
        </p>
      )}
      {error && (
        <ErrorState title="Watchlist unavailable" onRetry={refresh}>
          {error}
        </ErrorState>
      )}
      {!data ? (
        !error && <BuyerSkeleton />
      ) : data.items.length === 0 ? (
        <EmptyState
          title={
            view === 'watching'
              ? 'No active items saved'
              : view === 'won'
                ? 'No watched items won yet'
                : 'No watched items lost'
          }
        >
          Only items you save to your watchlist appear here.
        </EmptyState>
      ) : (
        <div className="agn-watch-list">
          {data.items.map((item) =>
            client ? (
              <WatchRow
                key={item.id}
                item={item}
                client={client}
                now={now}
                onRemove={() => void remove(item)}
                busy={removing === item.id}
                onExpired={refresh}
              />
            ) : (
              <BuyerSkeleton key={item.id} />
            ),
          )}
        </div>
      )}
      {data && (
        <WatchlistPagination
          page={pageCursors.length}
          hasNext={data.nextCursor !== null}
          onPrevious={() =>
            setPageCursors((value) =>
              value.length > 1 ? value.slice(0, -1) : value,
            )
          }
          onNext={() => {
            if (data.nextCursor)
              setPageCursors((value) => [
                ...value,
                data.nextCursor ?? undefined,
              ]);
          }}
        />
      )}
    </>
  );
  return (
    <BuyerPage
      title="Watchlist"
      description="Follow your saved items, from bidding to the final result."
    >
      <WatchlistLayout>
        <Tabs
          label="Watchlist status"
          value={view}
          onChange={(value) => {
            if (value === 'watching' || value === 'won' || value === 'lost') {
              setView(value);
              setPageCursors([undefined]);
              setError('');
            }
          }}
          items={[
            {
              value: 'watching',
              label: 'Watching',
              panel: view === 'watching' ? panel : null,
            },
            {
              value: 'won',
              label: 'Won',
              panel: view === 'won' ? panel : null,
            },
            {
              value: 'lost',
              label: 'Lost',
              panel: view === 'lost' ? panel : null,
            },
          ]}
        />
      </WatchlistLayout>
    </BuyerPage>
  );
}
