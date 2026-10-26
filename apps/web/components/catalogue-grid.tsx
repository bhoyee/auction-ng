'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import type { CatalogueLot } from '@auction-ng/shared';
import type { RealtimeClient } from '@auction-ng/api-client/realtime';
import { createUseLiveLot } from '@auction-ng/api-client/realtime-hook';
import { BuyerGrid, BuyerRail, LotCard, Toast } from '@auction-ng/ui/web';
import { apiUrl, realtimeUrl, useBuyer } from '../lib/session';
import { useOnline } from '../lib/network';
const useLiveLot = createUseLiveLot({ useEffect, useSyncExternalStore });
type Lot = CatalogueLot;
export function useBuyerRealtime() {
  const { tokens, deviceId } = useBuyer();
  const userId = tokens?.user.id;
  const credential = useRef(tokens);
  credential.current = tokens;
  const [owned, setOwned] = useState<{
    userId: string;
    client: RealtimeClient;
  } | null>(null);
  useEffect(() => {
    if (!userId) {
      setOwned(null);
      return;
    }
    let active = true;
    let next: RealtimeClient | undefined;
    void import('@auction-ng/api-client/realtime').then(
      ({ createRealtimeClient }) => {
        if (!active) return;
        next = createRealtimeClient(realtimeUrl, {
          onOutbid: () =>
            window.dispatchEvent(new Event('auction-ng-wallet-change')),
          credentials: () => {
            const current = credential.current;
            if (!current || current.user.id !== userId)
              throw new Error('Sign in again.');
            return { accessToken: current.accessToken, deviceId };
          },
        });
        setOwned({ userId, client: next });
      },
    );
    return () => {
      active = false;
      next?.close();
    };
  }, [userId, deviceId]);
  useEffect(() => {
    if (owned && owned.userId === userId) owned.client.reauthenticate();
  }, [owned, userId, tokens?.accessToken]);
  return owned && owned.userId === userId && tokens ? owned.client : null;
}
function LiveCard({
  lot,
  client,
  onOpen,
  onWatch,
  watched,
}: {
  lot: Lot;
  client: RealtimeClient;
  onOpen: () => void;
  onWatch: () => void;
  watched: boolean;
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
      endsAt={Date.parse(state.lot?.endsAt ?? lot.endsAt)}
      serverNow={now + state.clockOffsetMs}
      live={online && state.status === 'live'}
      allowOpenWhileStale
      startingPrice={lot.status === 'scheduled'}
      priceNotice="Scheduled auction"
      image={
        lot.thumbnail
          ? { src: lot.thumbnail.thumbnailUrl, alt: lot.title }
          : undefined
      }
      status={state.lot?.isLeader ? 'Winning' : undefined}
      watched={watched}
      onWatch={onWatch}
      onOpen={onOpen}
    />
  );
}
export function CatalogueGrid({
  lots,
  rail = false,
}: {
  lots: Lot[];
  rail?: boolean;
}) {
  const Layout = rail ? BuyerRail : BuyerGrid;
  const router = useRouter();
  const session = useBuyer();
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
      void import('@auction-ng/api-client/buyers')
        .then(({ createBuyerClient }) =>
          createBuyerClient(apiUrl, credentials).watched(ids.split(',')),
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
      router.push('/sign-in');
      return;
    }
    const watching = !watched.has(id);
    const userId = session.tokens.user.id;
    try {
      const { createBuyerClient } =
        await import('@auction-ng/api-client/buyers');
      await createBuyerClient(apiUrl, {
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
      <Layout>
        {lots.map((lot) =>
          client ? (
            <LiveCard
              key={lot.id}
              lot={lot}
              client={client}
              watched={watched.has(lot.id)}
              onOpen={() => router.push(`/lots/${lot.id}`)}
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
              endsAt={Date.parse(lot.endsAt)}
              serverNow={0}
              live={false}
              startingPrice
              image={
                lot.thumbnail
                  ? { src: lot.thumbnail.thumbnailUrl, alt: lot.title }
                  : undefined
              }
              watched={watched.has(lot.id)}
              onWatch={() => void watch(lot.id)}
              onOpen={() => router.push(`/lots/${lot.id}`)}
            />
          ),
        )}
      </Layout>
      {notice && <Toast onClose={() => setNotice('')}>{notice}</Toast>}
    </>
  );
}
