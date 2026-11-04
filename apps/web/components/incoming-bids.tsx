'use client';
import { useCallback, useEffect, useState } from 'react';
import { createBuyerClient } from '@auction-ng/api-client/buyers';
import { BuyerLink, BuyerSkeleton, BuyerStack } from '@auction-ng/ui/web/buyer';
import { IncomingBidItem } from '@auction-ng/ui/web/buyer-bids';
import {
  WalletNotice,
  WalletPagination,
} from '@auction-ng/ui/web/wallet-workspace';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
import { useWalletRead } from '../lib/wallet-read';
import { apiUrl, useBuyer } from '../lib/session';

export function IncomingBids({ cancelled = false }: { cancelled?: boolean }) {
  const { tokens } = useBuyer();
  const owner = tokens?.user.id;
  const [navigation, setNavigation] = useState<{
    owner?: string;
    pages: (string | undefined)[];
  }>({ pages: [undefined] });
  const pages = navigation.owner === owner ? navigation.pages : [undefined];
  const cursor = pages.at(-1);
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const load = useCallback(
    async (credentials: { accessToken: string; deviceId: string }) => ({
      ...(await createBuyerClient(apiUrl, credentials).preBids(
        cancelled ? 'cancelled' : 'incoming',
        { limit: 10, cursor },
      )),
      receivedAt: Date.now(),
    }),
    [cancelled, cursor],
  );
  const { data, error, reload } = useWalletRead(load);
  const serverNow =
    data && now ? Date.parse(data.serverTime) + now - data.receivedAt : 0;
  return (
    <BuyerStack>
      <h2 className="agn-buyer-bids-context">
        {cancelled ? 'Cancelled pre-bids' : 'Your incoming pre-bids'}
      </h2>
      {error && (
        <WalletNotice onRetry={reload}>
          Your pre-bids could not be refreshed. Check your connection and retry.
        </WalletNotice>
      )}
      {!data && !error && <BuyerSkeleton />}
      {data?.items.map((item) => (
        <IncomingBidItem
          key={item.id}
          entry={item}
          serverNow={serverNow}
          cancelled={cancelled}
        />
      ))}
      {data?.items.length === 0 && (
        <EmptyState
          title={
            cancelled ? 'No cancelled pre-bids' : 'No incoming pre-bids yet'
          }
          action={
            !cancelled && (
              <BuyerLink href="/upcoming-deals">
                Browse upcoming deals
              </BuyerLink>
            )
          }
        >
          Your saved pre-bids will appear here.
        </EmptyState>
      )}
      {data && (
        <WalletPagination
          page={pages.length}
          size={10}
          hasNext={!!data.nextCursor}
          onPrevious={() =>
            setNavigation({
              owner,
              pages: pages.length > 1 ? pages.slice(0, -1) : pages,
            })
          }
          onNext={() => {
            if (data.nextCursor)
              setNavigation({ owner, pages: [...pages, data.nextCursor] });
          }}
        />
      )}
    </BuyerStack>
  );
}
