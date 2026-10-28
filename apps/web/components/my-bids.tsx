'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createBuyerClient } from '@auction-ng/api-client/buyers';
import { createUseLiveLot } from '@auction-ng/api-client/realtime-hook';
import type { RealtimeClient } from '@auction-ng/api-client/realtime';
import type { BuyerBidPage } from '@auction-ng/shared';
import { formatNaira } from '@auction-ng/shared/money';
import { Badge } from '@auction-ng/ui/web/auction';
import { Button } from '@auction-ng/ui/web/button';
import {
  BuyerLink,
  BuyerActivityCard,
  BuyerRow,
  BuyerStack,
  BuyerSkeleton,
} from '@auction-ng/ui/web/buyer';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
import { ErrorState } from '@auction-ng/ui/web/error-state';
import { Tabs } from '@auction-ng/ui/web/tabs';
import { apiUrl, useBuyer } from '../lib/session';
import { useOnline } from '../lib/network';
import { useBuyerRealtime } from '../lib/buyer-realtime';
const useLiveLot = createUseLiveLot({ useEffect, useSyncExternalStore });
type Entry = BuyerBidPage['items'][number];
function BidRow({ entry, position }: { entry: Entry; position: string }) {
  return (
    <BuyerActivityCard
      image={entry.lot.thumbnailUrl}
      title={entry.lot.title}
      href={`/lots/${entry.lot.id}`}
      reference={entry.lot.lotNumber}
    >
      <Badge
        tone={
          position === 'Winning' || position === 'Won'
            ? 'win'
            : position === 'Outbid'
              ? 'outbid'
              : 'neutral'
        }
      >
        {position}
      </Badge>
      <p>
        {entry.lot.lotNumber} · Your last{' '}
        {entry.automatic ? 'automatic limit' : 'direct bid'}:{' '}
        {formatNaira(entry.amountKobo)}.
      </p>
      <p>
        {entry.outcome === 'cancelled'
          ? 'This item was purchased at its fixed price. Bid holds are released automatically.'
          : 'Open the lot for its current price and bidding.'}
      </p>
    </BuyerActivityCard>
  );
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
  const { tokens, deviceId } = useBuyer();
  const client = useBuyerRealtime();
  const [data, setData] = useState<BuyerBidPage>();
  const [cursor, setCursor] = useState<string>();
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState('All');
  useEffect(() => {
    let active = true;
    setData(undefined);
    setError(false);
    if (tokens)
      void createBuyerClient(apiUrl, {
        accessToken: tokens.accessToken,
        deviceId,
      })
        .bids({ limit: 20, cursor })
        .then((value) => {
          if (active) setData(value);
        })
        .catch(() => {
          if (active) setError(true);
        });
    return () => {
      active = false;
    };
  }, [tokens, deviceId, cursor, version]);
  const latest = new Map<string, Entry>();
  for (const entry of data?.items ?? [])
    if (!latest.has(entry.lot.id)) latest.set(entry.lot.id, entry);
  const unique = [...latest.values()];
  return (
    <BuyerPage
      narrow
      title="My bids"
      description="Your latest bids. Live positions update while connected; confirmed wins and losses appear after an auction closes."
    >
      {error ? (
        <ErrorState onRetry={() => setVersion((value) => value + 1)} />
      ) : !data ? (
        <BuyerSkeleton />
      ) : !data.items.length ? (
        <EmptyState
          title="No bids yet"
          action={<BuyerLink href="/">Browse auctions</BuyerLink>}
        >
          Your accepted bids will appear here.
        </EmptyState>
      ) : (
        <BuyerStack>
          <Tabs
            label="Bid positions"
            value={tab}
            onChange={setTab}
            items={['All', 'Winning', 'Outbid', 'Won', 'Lost', 'Cancelled'].map(
              (selected) => ({
                value: selected,
                label: selected,
                panel: (
                  <BuyerStack>
                    <p>
                      {selected === 'Winning' || selected === 'Outbid'
                        ? 'Live positions on this page appear when the connection is up to date.'
                        : 'Your bids on this page.'}
                    </p>
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
                  </BuyerStack>
                ),
              }),
            )}
          />
          <BuyerRow>
            {cursor && (
              <Button variant="secondary" onClick={() => setCursor(undefined)}>
                Back to newest
              </Button>
            )}
            {data.nextCursor && (
              <Button
                variant="secondary"
                onClick={() => setCursor(data.nextCursor ?? undefined)}
              >
                Next page
              </Button>
            )}
          </BuyerRow>
        </BuyerStack>
      )}
    </BuyerPage>
  );
}
