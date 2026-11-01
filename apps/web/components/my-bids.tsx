'use client';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { createBuyerClient } from '@auction-ng/api-client/buyers';
import { createUseLiveLot } from '@auction-ng/api-client/realtime-hook';
import type { RealtimeClient } from '@auction-ng/api-client/realtime';
import type { BuyerBidPage } from '@auction-ng/shared';
import {
  BuyerBidItem,
  BuyerBidsLayout,
  BuyerBidsList,
  LiveBidTabLabel,
} from '@auction-ng/ui/web/buyer-bids';
import {
  WalletNotice,
  WalletPagination,
} from '@auction-ng/ui/web/wallet-workspace';
import { useWalletRead } from '../lib/wallet-read';
import { BuyerLink, BuyerSkeleton } from '@auction-ng/ui/web/buyer';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
import { Tabs } from '@auction-ng/ui/web/tabs';
import { apiUrl, useBuyer } from '../lib/session';
import { useOnline } from '../lib/network';
import { useBuyerRealtime } from '../lib/buyer-realtime';
const useLiveLot = createUseLiveLot({ useEffect, useSyncExternalStore });
type Entry = BuyerBidPage['items'][number];
function BidRow({ entry, position }: { entry: Entry; position: string }) {
  return <BuyerBidItem entry={entry} position={position} />;
}
function ActiveBidRow({
  entry,
  client,
  selected,
}: {
  entry: Entry;
  client: RealtimeClient;
  selected: string;
}) {
  const live = useLiveLot(client, entry.lot.id);
  const online = useOnline();
  const position =
    online && live.status === 'live' && live.lot
      ? live.lot.isLeader
        ? 'Winning'
        : 'Outbid'
      : 'Reconnecting';
  if (selected !== 'All' && selected !== position) return null;
  return <BidRow entry={entry} position={position} />;
}
export function MyBids() {
  const { tokens } = useBuyer();
  const owner = tokens?.user.id;
  const client = useBuyerRealtime();
  const [navigation, setNavigation] = useState<{
    owner?: string;
    pages: (string | undefined)[];
  }>({ pages: [undefined] });
  const pages = navigation.owner === owner ? navigation.pages : [undefined];
  const cursor = pages.at(-1);
  const [tab, setTab] = useState('All');
  const read = useCallback(
    (credentials: { accessToken: string; deviceId: string }) =>
      createBuyerClient(apiUrl, credentials).bids({ limit: 10, cursor }),
    [cursor],
  );
  const { data, error, reload } = useWalletRead(read);
  const latest = new Map<string, Entry>();
  for (const entry of data?.items ?? [])
    if (!latest.has(entry.lot.id)) latest.set(entry.lot.id, entry);
  const unique = [...latest.values()];
  return (
    <BuyerPage
      title="Bid history"
      description="Your latest bids. Live positions update while connected; confirmed wins and losses appear after an auction closes."
    >
      {error && (
        <WalletNotice onRetry={reload}>
          Bid history could not be refreshed. Check your connection and retry.
        </WalletNotice>
      )}
      {!data ? (
        error ? null : (
          <BuyerSkeleton />
        )
      ) : !data.items.length && pages.length === 1 ? (
        <EmptyState
          title="No bids yet"
          action={<BuyerLink href="/">Browse auctions</BuyerLink>}
        >
          Your accepted bids will appear here.
        </EmptyState>
      ) : (
        <BuyerBidsLayout>
          <Tabs
            label="Bid positions"
            value={tab}
            onChange={setTab}
            items={['All', 'Winning', 'Outbid', 'Won', 'Lost', 'Cancelled'].map(
              (selected) => ({
                value: selected,
                label:
                  selected === 'Outbid' || selected === 'Winning' ? (
                    <LiveBidTabLabel label={selected} />
                  ) : (
                    selected
                  ),
                panel:
                  selected !== tab ? null : (
                    <>
                      <p className="agn-buyer-bids-context">
                        {selected === 'Outbid'
                          ? 'These auctions are still running. You can bid again. Live positions on this page.'
                          : selected === 'Winning'
                            ? 'Live positions on this page. Reconnecting items remain in All.'
                            : 'Latest bid per item from this page of 10 records. Amounts are historical.'}
                      </p>
                      <BuyerBidsList>
                        {unique.map((entry) =>
                          entry.outcome === 'pending' ? (
                            client ? (
                              <ActiveBidRow
                                key={entry.lot.id}
                                entry={entry}
                                client={client}
                                selected={selected}
                              />
                            ) : selected === 'All' ? (
                              <BidRow
                                key={entry.lot.id}
                                entry={entry}
                                position="Reconnecting"
                              />
                            ) : null
                          ) : selected === 'All' ||
                            selected.toLowerCase() === entry.outcome ? (
                            <BidRow
                              key={entry.lot.id}
                              entry={entry}
                              position={
                                entry.outcome === 'won'
                                  ? 'Won'
                                  : entry.outcome === 'cancelled'
                                    ? 'Cancelled'
                                    : 'Lost'
                              }
                            />
                          ) : null,
                        )}
                      </BuyerBidsList>
                    </>
                  ),
              }),
            )}
          />
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
        </BuyerBidsLayout>
      )}
    </BuyerPage>
  );
}
