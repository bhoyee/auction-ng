'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import type { RealtimeClient } from '@auction-ng/api-client/realtime';
import { createUseLiveLot } from '@auction-ng/api-client/realtime-hook';
import { BuyerGrid, BuyerRail } from '@auction-ng/ui/web/buyer-grids';
import { LotCard } from '@auction-ng/ui/web/auction';
import { Toast } from '@auction-ng/ui/web/toast';
import { apiUrl, useBuyer } from '../lib/session';
import { useOnline } from '../lib/network';
import { useBuyerRealtime } from '../lib/buyer-realtime';
import { useServerClock } from '../lib/server-clock';
const useLiveLot = createUseLiveLot({ useEffect, useSyncExternalStore });
type Lot = import('./catalogue-grid').CardLot;

function LiveCard({
  lot,
  client,
  onOpen,
  onWatch,
  watched,
  onBid,
}: {
  lot: Lot;
  client: RealtimeClient;
  onOpen: () => void;
  onWatch: () => void;
  watched: boolean;
  onBid: () => void;
}) {
  const state = useLiveLot(client, lot.id);
  const online = useOnline();
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <LotCard
      title={lot.title}
      reference={lot.lotNumber}
      condition={lot.condition}
      priceKobo={state.lot?.currentPriceKobo ?? lot.startPriceKobo}
      retailKobo={lot.retailPriceKobo}
      bidCount={lot.bidCount}
      location={lot.location.name}
      endsAt={Date.parse(state.lot?.endsAt ?? lot.endsAt)}
      serverNow={now + state.clockOffsetMs}
      live={online && state.status === 'live'}
      allowOpenWhileStale
      startingPrice={
        lot.status === 'scheduled' ||
        (online &&
          state.status === 'live' &&
          state.lot?.currentPriceKobo === null)
      }
      priceNotice={lot.status === 'scheduled' ? 'Scheduled auction' : ''}
      image={
        lot.thumbnail
          ? { src: lot.thumbnail.thumbnailUrl, alt: lot.title }
          : undefined
      }
      status={
        online && state.status === 'live' && state.lot?.isLeader
          ? 'Winning'
          : undefined
      }
      watched={watched}
      secondImage={lot.secondImage}
      onWatch={onWatch}
      onOpen={onOpen}
      onBid={onBid}
    />
  );
}
export function ClientCatalogueGrid({
  lots,
  rail = false,
  columns,
}: {
  lots: Lot[];
  rail?: boolean;
  columns?: 3 | 4;
  serverTime?: string;
}) {
  const Layout = rail ? BuyerRail : BuyerGrid;
  const router = useRouter();
  const session = useBuyer();
  const now = useServerClock(session.ready && !session.tokens);
  const client = useBuyerRealtime();
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState('');
  const revision = useRef(0);
  const currentUser = useRef(session.tokens?.user.id);
  currentUser.current = session.tokens?.user.id;
  const ids = lots.map((lot) => lot.id).join(',');
  useEffect(() => {
    const update = (event: Event) => {
      const detail: unknown = (event as CustomEvent<unknown>).detail;
      if (
        !detail ||
        typeof detail !== 'object' ||
        !('userId' in detail) ||
        detail.userId !== session.tokens?.user.id ||
        !('lotId' in detail) ||
        typeof detail.lotId !== 'string' ||
        !ids.split(',').includes(detail.lotId) ||
        !('watching' in detail) ||
        typeof detail.watching !== 'boolean'
      )
        return;
      const { lotId, watching } = detail;
      revision.current++;
      setWatched((previous) => {
        const next = new Set(previous);
        if (watching) next.add(lotId);
        else next.delete(lotId);
        return next;
      });
    };
    window.addEventListener('auction-ng-watchlist-change', update);
    return () =>
      window.removeEventListener('auction-ng-watchlist-change', update);
  }, [ids, session.tokens?.user.id]);
  useEffect(() => {
    let active = true;
    const version = revision.current;
    setWatched((previous) => (previous.size ? new Set() : previous));
    const credentials = session.tokens
      ? {
          accessToken: session.tokens.accessToken,
          deviceId: session.deviceId,
        }
      : null;
    if (credentials && ids)
      void import('@auction-ng/api-client/watch-status')
        .then(({ createWatchStatusClient }) =>
          createWatchStatusClient(apiUrl, credentials).watched(ids.split(',')),
        )
        .then((value) => {
          if (active && version === revision.current)
            setWatched(new Set(value.lotIds));
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [session.tokens, session.deviceId, ids]);
  const watch = async (id: string) => {
    if (!session.tokens) {
      router.push(`/sign-in?${new URLSearchParams({ next: `/lots/${id}` })}`);
      return;
    }
    const watching = !watched.has(id);
    const userId = session.tokens.user.id;
    try {
      const { createWatchStatusClient } =
        await import('@auction-ng/api-client/watch-status');
      await createWatchStatusClient(apiUrl, {
        accessToken: session.tokens.accessToken,
        deviceId: session.deviceId,
      }).watch(id, watching);
      if (currentUser.current !== userId) return;
      window.dispatchEvent(
        new CustomEvent('auction-ng-watchlist-change', {
          detail: { userId, lotId: id, watching },
        }),
      );
      setNotice(
        watching
          ? 'Lot saved to your watchlist.'
          : 'Lot removed from your watchlist.',
      );
    } catch {
      setNotice('Your watchlist could not be updated. Try again.');
    }
  };
  return (
    <>
      <Layout columns={columns}>
        {lots.map((lot) =>
          client ? (
            <LiveCard
              key={lot.id}
              lot={lot}
              client={client}
              watched={watched.has(lot.id)}
              onOpen={() => router.push(`/lots/${lot.id}`)}
              onBid={() => router.push(`/lots/${lot.id}?bid=1`)}
              onWatch={() => void watch(lot.id)}
            />
          ) : (
            <LotCard
              key={lot.id}
              title={lot.title}
              reference={lot.lotNumber}
              condition={lot.condition}
              priceKobo={lot.startPriceKobo}
              retailKobo={lot.retailPriceKobo}
              bidCount={lot.bidCount}
              location={lot.location.name}
              endsAt={Date.parse(lot.endsAt)}
              serverNow={now}
              live={false}
              startingPrice={lot.status === 'scheduled'}
              allowOpenWhileStale
              image={
                lot.thumbnail
                  ? { src: lot.thumbnail.thumbnailUrl, alt: lot.title }
                  : undefined
              }
              watched={watched.has(lot.id)}
              onWatch={() => void watch(lot.id)}
              secondImage={lot.secondImage}
              onOpen={() => router.push(`/lots/${lot.id}`)}
              onBid={() =>
                router.push(
                  `/sign-in?${new URLSearchParams({ next: `/lots/${lot.id}?bid=1` })}`,
                )
              }
            />
          ),
        )}
      </Layout>
      {notice && <Toast onClose={() => setNotice('')}>{notice}</Toast>}
    </>
  );
}
