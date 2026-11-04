import { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { createBuyerClient } from '@auction-ng/api-client';
import { formatNaira, type BuyerBidPage } from '@auction-ng/shared';
import {
  Page,
  Private,
  Notice,
  Pagination,
  Loading,
} from '../components/ui/page';
import { Body, Button, Tabs } from '../components/ui/controls';
import { n } from '../components/ui/native-styles';
import { bidHistoryStyles as bh } from '../components/ui/bid-history-styles';
import { useSession } from '../lib/session';
import { useLiveRead } from '../lib/live-read';
import { useLiveLot } from '../lib/realtime';
import { apiUrl, safeMobilePath } from '../lib/config';
import { photoUrl } from './catalogue';
import { AuctionCountdown } from '../components/ui/auction-countdown';
import { useTick } from '../lib/clock';
import { useBuyerActivity } from '../lib/buyer-activity';
function usePages() {
  const [cursor, setCursor] = useState<string>(),
    [pages, setPages] = useState<(string | undefined)[]>([]);
  return {
    cursor,
    reset: () => {
      setCursor(undefined);
      setPages([]);
    },
    previous: pages.length
      ? () => {
          setCursor(pages.at(-1));
          setPages((p) => p.slice(0, -1));
        }
      : undefined,
    next: (next: string | null | undefined) =>
      next
        ? () => {
            setPages((p) => [...p, cursor]);
            setCursor(next);
          }
        : undefined,
  };
}
export function WatchlistScreen() {
  const activity = useBuyerActivity();
  const { manager, session } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState('Watching'),
    [error, setError] = useState('');
  const pages = usePages();
  const read = useLiveRead(
    () =>
      manager.run((c) =>
        createBuyerClient(apiUrl, c).watchActivity(
          tab.toLowerCase() as 'watching' | 'won' | 'lost',
          { limit: 10, cursor: pages.cursor },
        ),
      ),
    [tab, pages.cursor, session?.user.id],
    5000,
  );
  return (
    <Page title="Your watchlist" back={false} scroll={false}>
      <Private>
        <View style={n.content}>
          <Tabs
            label="Saved auctions"
            items={['Watching', 'Won', 'Lost'].map((value) => ({
              value,
              label: value,
              panel: null,
            }))}
            value={tab}
            onChange={(value) => {
              setTab(value);
              pages.reset();
            }}
          />
          <Notice
            message={error || read.error}
            onClose={() => {
              setError('');
              read.refresh();
            }}
          />
        </View>
        <FlashList
          data={read.data?.items ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View style={[n.surface, { marginBottom: 12 }]}>
              <View style={n.row}>
                <Image source={photoUrl(item.thumbnailUrl)} style={n.thumb} />
                <View style={n.grow}>
                  <Body style={n.bold}>{item.title}</Body>
                  {tab === 'Watching' ? (
                    <WatchPrice id={item.id} start={item.startPriceKobo} />
                  ) : (
                    <Body>
                      {item.finalPriceKobo
                        ? formatNaira(item.finalPriceKobo)
                        : 'Ended unsold'}
                    </Body>
                  )}
                </View>
              </View>
              <Body tone="secondary">Pickup: {item.locationName}</Body>
              <View style={n.row}>
                <Button onPress={() => router.push(`/lots/${item.id}`)}>
                  {tab === 'Watching' ? 'Enter bid' : 'View item'}
                </Button>
                <Button
                  variant="danger"
                  onPress={() =>
                    void manager
                      .run((c) =>
                        createBuyerClient(apiUrl, c).watch(item.id, false),
                      )
                      .then(() => {
                        read.refresh();
                        activity.refresh();
                      })
                      .catch(() =>
                        setError('Could not remove this saved item. Retry.'),
                      )
                  }
                >
                  Unwatch
                </Button>
              </View>
            </View>
          )}
          ListEmptyComponent={
            read.data ? (
              <View style={n.surface}>
                <Body>No saved items in {tab.toLowerCase()}.</Body>
                <Button onPress={() => router.push('/browse')}>
                  Browse auctions
                </Button>
              </View>
            ) : (
              <Loading />
            )
          }
          ListFooterComponent={
            <Pagination
              previous={pages.previous}
              next={pages.next(read.data?.nextCursor)}
            />
          }
        />
      </Private>
    </Page>
  );
}
function WatchPrice({ id, start }: { id: string; start: number }) {
  const live = useLiveLot(id);
  const tick = useTick();
  return (
    <>
      <Body style={n.cardPrice}>
        {live.status === 'live'
          ? formatNaira(live.lot?.currentPriceKobo ?? start)
          : 'Checking price'}
      </Body>
      <AuctionCountdown
        endsAt={Date.parse(live.lot?.endsAt ?? '')}
        serverNow={tick + live.clockOffsetMs}
        live={live.status === 'live'}
      />
    </>
  );
}
export function BidsScreen() {
  const { manager, session } = useSession();
  const [tab, setTab] = useState('All');
  const pages = usePages();
  const read = useLiveRead(
    () =>
      manager.run((c) =>
        createBuyerClient(apiUrl, c).bids({ limit: 10, cursor: pages.cursor }),
      ),
    [pages.cursor, session?.user.id],
    5000,
  );
  const unique = [
    ...new Map(
      (read.data?.items ?? []).map((item) => [item.lot.id, item]),
    ).values(),
  ];
  return (
    <Page title="Bid history">
      <Private>
        <ScrollView
          horizontal
          style={bh.tabs}
          contentContainerStyle={bh.tabRail}
          showsHorizontalScrollIndicator={false}
          accessibilityRole="tablist"
          accessibilityLabel="Bid status"
        >
          {['All', 'Winning', 'Outbid', 'Won', 'Lost', 'Cancelled'].map(
            (value) => (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === value }}
                onPress={() => setTab(value)}
                style={[bh.tab, tab === value && bh.selected]}
              >
                <Body style={[bh.label, tab === value && bh.white]}>
                  {value}
                </Body>
              </Pressable>
            ),
          )}
        </ScrollView>
        {!read.data && !read.error && <Loading />}
        <Notice message={read.error} onClose={read.refresh} />
        {unique.map((item) => (
          <BidRow key={item.id} item={item} tab={tab} />
        ))}
        {read.data?.items.length === 0 && (
          <Body>No bids yet. Your accepted bids will appear here.</Body>
        )}
        <Pagination
          previous={pages.previous}
          next={pages.next(read.data?.nextCursor)}
        />
      </Private>
    </Page>
  );
}
function BidRow({
  item,
  tab,
}: {
  item: BuyerBidPage['items'][number];
  tab: string;
}) {
  const live = useLiveLot(item.lot.id);
  const router = useRouter();
  const active =
    item.outcome === 'pending' && ['open', 'closing'].includes(item.lot.status);
  const status = active
    ? live.status === 'live'
      ? live.lot?.isLeader
        ? 'Winning'
        : 'Outbid'
      : 'Checking'
    : item.outcome === 'pending'
      ? 'Closing'
      : item.outcome[0]?.toUpperCase() + item.outcome.slice(1);
  if (tab !== 'All' && tab !== status) return null;
  return (
    <View style={n.surface}>
      <Pressable
        style={bh.itemHeading}
        accessibilityRole="button"
        accessibilityLabel={`View ${item.lot.title}`}
        onPress={() => router.push(`/lots/${item.lot.id}`)}
      >
        <Image
          source={photoUrl(item.lot.thumbnailUrl)}
          style={bh.thumbnail}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={item.lot.id}
          accessible={false}
        />
        <View style={bh.itemText}>
          <Body style={bh.title} numberOfLines={2}>
            {item.lot.title}
          </Body>
          <Body tone="fine" style={bh.muted}>
            Item {item.lot.lotNumber}
          </Body>
        </View>
      </Pressable>
      <View style={bh.statuses}>
        <View
          style={[
            bh.badge,
            status === 'Winning' || status === 'Won'
              ? bh.success
              : ['Lost', 'Outbid', 'Cancelled'].includes(status)
                ? bh.danger
                : undefined,
          ]}
        >
          <Body
            tone="fine"
            style={[
              n.bold,
              ['Winning', 'Won', 'Lost', 'Outbid', 'Cancelled'].includes(
                status,
              ) && bh.white,
            ]}
          >
            {status}
          </Body>
        </View>
        {active && live.status === 'live' && (
          <View style={[bh.badge, bh.live]}>
            <Body tone="fine" style={[n.bold, bh.white]}>
              Live auction
            </Body>
          </View>
        )}
      </View>
      <View style={bh.amountPanel}>
        <Body tone="fine" style={n.grow}>
          {item.automatic ? 'Your private limit' : 'Your bid'}
        </Body>
        <Body
          style={n.historyAmount}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {formatNaira(item.amountKobo)}
        </Body>
      </View>
      {active && (
        <Body tone="fine">
          Accepted bids cannot be cancelled. Reserved funds are released when
          you are outbid.
        </Body>
      )}
      <Button
        fullWidth
        variant={active ? 'success' : 'primary'}
        onPress={() => router.push(`/lots/${item.lot.id}`)}
      >
        {active ? 'Open live auction' : 'View item'}
      </Button>
    </View>
  );
}
export function OrdersScreen({ purchases = false }: { purchases?: boolean }) {
  const { manager, session } = useSession();
  const router = useRouter();
  const pages = usePages();
  const read = useLiveRead(
    () =>
      manager.run((c) =>
        purchases
          ? createBuyerClient(apiUrl, c).purchases({
              limit: 10,
              cursor: pages.cursor,
            })
          : createBuyerClient(apiUrl, c).collections({
              limit: 10,
              cursor: pages.cursor,
            }),
      ),
    [purchases, pages.cursor, session?.user.id],
    5000,
  );
  return (
    <Page title={purchases ? 'Purchase history' : 'Awaiting pickup'}>
      <Private>
        <Notice message={read.error} onClose={read.refresh} />
        {read.data?.items.map((item) => (
          <Pressable
            key={item.id}
            style={n.surface}
            accessibilityRole="button"
            onPress={() => router.push(`/invoices/${item.id}`)}
          >
            <View style={n.between}>
              <Body style={n.bold}>{item.number}</Body>
              <View style={item.status === 'paid' ? n.success : n.badge}>
                <Body
                  tone="fine"
                  style={item.status === 'paid' ? n.white : undefined}
                >
                  {item.status}
                </Body>
              </View>
            </View>
            <Body style={n.cardPrice}>{formatNaira(item.totalKobo)}</Body>
            <Body tone="secondary">
              {item.saleType === 'fixed_price' ? 'Buy Now' : 'Auction win'} -{' '}
              {new Date(item.createdAt).toLocaleDateString('en-NG', {
                timeZone: 'Africa/Lagos',
              })}
            </Body>
            <Body tone="secondary">View invoice and pickup details</Body>
          </Pressable>
        ))}
        {read.data?.items.length === 0 && (
          <View style={n.surface}>
            <Body>No orders here yet.</Body>
            <Button onPress={() => router.push('/browse')}>
              Explore auctions
            </Button>
          </View>
        )}
        <Pagination
          previous={pages.previous}
          next={pages.next(read.data?.nextCursor)}
        />
      </Private>
    </Page>
  );
}
export function NotificationsScreen() {
  const activity = useBuyerActivity();
  const { manager, session } = useSession();
  const router = useRouter();
  const pages = usePages();
  const read = useLiveRead(
    () =>
      manager.run((c) =>
        createBuyerClient(apiUrl, c).notifications({
          limit: 10,
          cursor: pages.cursor,
        }),
      ),
    [pages.cursor, session?.user.id],
    5000,
  );
  return (
    <Page title="Notifications">
      <Private>
        <Notice message={read.error} onClose={read.refresh} />
        {read.data?.items.map((item) => (
          <Pressable
            accessibilityRole="button"
            key={item.id}
            style={[n.surface, !item.readAt && n.shade]}
            onPress={() => {
              void manager
                .run((c) =>
                  createBuyerClient(apiUrl, c).readNotifications([item.id]),
                )
                .then(() => {
                  read.refresh();
                  activity.refresh();
                  const path =
                    item.href === '/awaiting-pickup'
                      ? '/orders'
                      : item.href === '/invoices'
                        ? '/orders'
                        : item.href.startsWith('/customer-service')
                          ? item.href.replace('/customer-service', '/support')
                          : safeMobilePath(item.href);
                  router.push(path as '/');
                })
                .catch(() => {});
            }}
          >
            <Body style={!item.readAt ? n.bold : undefined}>{item.title}</Body>
            <Body tone="fine">
              {new Date(item.createdAt).toLocaleString('en-NG', {
                timeZone: 'Africa/Lagos',
              })}{' '}
              WAT
            </Body>
          </Pressable>
        ))}
        {read.data?.items.length === 0 && <Body>You are all caught up.</Body>}
        <Pagination
          previous={pages.previous}
          next={pages.next(read.data?.nextCursor)}
        />
      </Private>
    </Page>
  );
}
