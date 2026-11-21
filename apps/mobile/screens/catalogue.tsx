import { ConditionBadge } from '../components/ui/condition-badge';
import { DiscountBadge } from '../components/ui/discount-badge';
import { InstantWinBadge } from '../components/ui/instant-win-badge';
import {
  browseCollections,
  cardAction,
  collectionFromParam,
  collectionParam,
  collectionSection,
  type BrowseCollection,
} from '../lib/browse-collections';
import { CatalogueFilter } from '../components/ui/catalogue-filter';
import { browseDeals } from '@auction-ng/api-client/deals';
import { databaseValues, type DealFilters } from '@auction-ng/shared';
import { useEffect, useState } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { mobileTheme as t } from '@auction-ng/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { Heart, Search } from 'lucide-react-native';
import {
  createCatalogueClient,
  createSearchClient,
} from '@auction-ng/api-client';
import {
  readComingSoonDeals,
  readUpcomingDeals,
} from '@auction-ng/api-client/prebids';
import type { CatalogueLot } from '@auction-ng/shared';
import { Page, Notice, Loading, Pagination } from '../components/ui/page';
import { Body, Button, Tabs } from '../components/ui/controls';
import { formatNaira } from '@auction-ng/shared/money';
import { AuctionCountdown } from '../components/ui/auction-countdown';
import { colors } from '../components/ui/styles';
import { n } from '../components/ui/native-styles';
import { h } from '../components/ui/home-styles';
import { useLiveRead } from '../lib/live-read';
import { useSession } from '../lib/session';
import { apiUrl } from '../lib/config';
import { useLiveLot } from '../lib/realtime';
import { useTick } from '../lib/clock';
import { createBuyerClient } from '@auction-ng/api-client/buyers';
import { useBuyerActivity } from '../lib/buyer-activity';
export function ProductCard({
  lot,
  upcoming = false,
  instantWin = false,
}: {
  lot: CatalogueLot;
  upcoming?: boolean;
  /** Instant Win list: the card buys at the fixed price instead of bidding. */
  instantWin?: boolean;
}) {
  const activity = useBuyerActivity();
  const router = useRouter();
  const { manager, session } = useSession();
  const live = useLiveLot(lot.id, !upcoming);
  const now = useTick();
  const [error, setError] = useState(''),
    [watched, setWatched] = useState(false);
  const action = cardAction({
    id: lot.id,
    fixedPriceKobo: lot.fixedPriceKobo,
    instantWin,
    upcoming,
    comingSoon: lot.comingSoon,
    paused: live.lot?.pausedAt !== undefined,
  });
  const buyPrice = action.buyPrice;
  return (
    <View style={n.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={'View ' + lot.title}
        onPress={() => router.push(`/lots/${lot.id}`)}
      >
        <Image
          source={photoUrl(lot.thumbnail?.thumbnailUrl)}
          style={n.photo}
          contentFit="cover"
          cachePolicy="memory-disk"
          accessibilityLabel={lot.title}
        />
        {!lot.comingSoon && (
          // No countdown without a date (Coming soon, 2026-11-14).
          <AuctionCountdown
            photo
            paused={live.lot?.pausedAt !== undefined}
            endsAt={Date.parse(
              upcoming ? lot.startsAt : (live.lot?.endsAt ?? lot.endsAt),
            )}
            serverNow={live.lot?.pausedAt ?? now + live.clockOffsetMs}
            live={live.status === 'live'}
            upcoming={upcoming}
          />
        )}
      </Pressable>
      <View style={n.overlay}>
        <View style={n.badges}>
          <ConditionBadge condition={lot.condition} />
          <DiscountBadge
            priceKobo={
              upcoming
                ? lot.startPriceKobo
                : live.status === 'live'
                  ? (live.lot?.currentPriceKobo ?? lot.startPriceKobo)
                  : undefined
            }
            retailKobo={lot.retailPriceKobo}
          />
          {!upcoming && <InstantWinBadge priceKobo={lot.fixedPriceKobo} />}
        </View>
        <Pressable
          style={n.icon}
          accessibilityRole="button"
          accessibilityLabel={watched ? 'Unwatch item' : 'Watch item'}
          onPress={() => {
            if (!session)
              return router.push({
                pathname: '/sign-in',
                params: { next: `/lots/${lot.id}` },
              });
            void manager
              .run((c) => createBuyerClient(apiUrl, c).watch(lot.id, !watched))
              .then(() => {
                setWatched((v) => !v);
                activity.refresh();
              })
              .catch(() => setError('Could not update watchlist. Retry.'));
          }}
        >
          <Heart
            size={18}
            color={colors['indigo-900']}
            fill={watched ? colors['danfo-400'] : 'none'}
          />
        </Pressable>
      </View>
      <View style={n.cardCopy}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/lots/${lot.id}`)}
        >
          <Body numberOfLines={2} style={h.cardTitle}>
            {lot.title}
          </Body>
        </Pressable>
        {upcoming ? (
          <>
            <Body style={n.cardPrice}>{formatNaira(lot.startPriceKobo)}</Body>
            {lot.comingSoon ? (
              <Body tone="fine">Coming soon · date to be announced</Body>
            ) : (
              <Body tone="fine">
                Goes live{' '}
                {new Date(lot.startsAt).toLocaleString('en-NG', {
                  timeZone: 'Africa/Lagos',
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                WAT
              </Body>
            )}
          </>
        ) : buyPrice ? (
          <>
            <Body style={n.cardPrice}>{formatNaira(buyPrice)}</Body>
            <Body tone="fine">Instant win · tax added at checkout</Body>
          </>
        ) : (
          <Body style={n.cardPrice}>
            {live.status === 'live'
              ? formatNaira(live.lot?.currentPriceKobo ?? lot.startPriceKobo)
              : 'Checking price'}
          </Body>
        )}
        <Notice message={error} onClose={() => setError('')} />
        <Button
          fullWidth
          variant="success"
          size="small"
          disabled={
            !upcoming &&
            (live.status !== 'live' || live.lot?.pausedAt !== undefined)
          }
          onPress={() => router.push(action.href)}
        >
          {action.label}
        </Button>
      </View>
    </View>
  );
}
export function photoUrl(value?: string | null) {
  if (!value) return undefined;
  if (value.startsWith('https://dev-images.auction.invalid/'))
    return value.replace(
      'https://dev-images.auction.invalid',
      `${apiUrl}/dev-images/public`,
    );
  return value.startsWith('https://demo.auction.invalid/')
    ? value.replace(
        'https://demo.auction.invalid',
        process.env.EXPO_PUBLIC_WEB_URL ?? apiUrl.replace(':4000', ':3300'),
      )
    : value;
}
export function BrowseScreen({ upcoming = false }: { upcoming?: boolean }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const { width, fontScale } = useWindowDimensions();
  const columns = width >= 1100 ? 4 : width >= 700 ? 3 : 2;
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<DealFilters>({
    limit: 20,
    section: 'all',
    prices: [],
    ends: [],
    conditions: [...databaseValues.lotConditions],
  });
  const categories = useLiveRead(() =>
    createCatalogueClient(apiUrl).categories({ limit: 50 }),
  );
  const [mode, setMode] = useState<BrowseCollection>('All Deals'),
    [query, setQuery] = useState(''),
    [cursor, setCursor] = useState<string>(),
    [history, setHistory] = useState<(string | undefined)[]>([]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setCursor(undefined);
      setHistory([]);
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    setMode(collectionFromParam(params.mode));
    setCursor(undefined);
    setHistory([]);
  }, [params.mode]);
  const scheduled = upcoming || mode === 'Upcoming';
  // Search covers every auction, so it never limits itself to Instant Win.
  const instantWin = !scheduled && !search && mode === 'Instant Win';
  const read = useLiveRead(
    () =>
      scheduled
        ? readUpcomingWithComingSoon(cursor)
        : search
          ? createSearchClient(apiUrl).search({ q: search, limit: 20, cursor })
          : browseDeals(apiUrl, {
              ...filters,
              limit: 20,
              cursor,
              section: collectionSection(mode),
            }),
    [scheduled, mode, search, cursor, JSON.stringify(filters)],
  );
  return (
    <Page
      title={scheduled ? 'Upcoming Deals' : 'Browse deals'}
      back={false}
      scroll={false}
    >
      <View style={n.content}>
        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
          <View
            style={{
              minWidth: Math.max(
                width - 48,
                t.layout.touch * 12 * Math.max(1, fontScale),
              ),
            }}
          >
            <Tabs
              label="Deal collections"
              items={browseCollections.map((value) => ({
                value,
                label: value,
                panel: null,
              }))}
              value={upcoming ? 'Upcoming' : mode}
              onChange={(value) => {
                if (upcoming && value !== 'Upcoming') {
                  router.replace({
                    pathname: '/browse',
                    params: {
                      mode: collectionParam(value as BrowseCollection),
                    },
                  });
                  return;
                }
                setMode(value as BrowseCollection);
                setCursor(undefined);
                setHistory([]);
              }}
            />
          </View>
        </ScrollView>

        {!scheduled && (
          <>
            <View style={n.browseSearch}>
              <Search
                size={20}
                color={colors['slate-600']}
                accessible={false}
              />
              <TextInput
                accessibilityLabel="Search deals"
                placeholder="Search by item or brand"
                placeholderTextColor={colors['slate-600']}
                returnKeyType="search"
                autoCorrect={false}
                style={n.browseSearchInput}
                value={query}
                onChangeText={(text) => {
                  setQuery(text);
                  setCursor(undefined);
                  setHistory([]);
                }}
              />
            </View>
            <CatalogueFilter
              value={filters}
              onChange={(value) => {
                setFilters(value);
                setCursor(undefined);
                setHistory([]);
              }}
              categories={categories.data?.items ?? []}
            />
          </>
        )}
        <Notice message={read.error} onClose={read.refresh} />
      </View>
      {!read.data && !read.error && <Loading />}
      <FlashList
        key={columns}
        data={read.data?.items ?? []}
        numColumns={columns}
        keyExtractor={(lot) => lot.id}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => (
          <View style={{ flex: 1, margin: 4 }}>
            <ProductCard
              lot={item}
              upcoming={scheduled}
              instantWin={instantWin}
            />
          </View>
        )}
        onRefresh={read.refresh}
        refreshing={false}
        ListEmptyComponent={
          read.data ? (
            instantWin ? (
              <View style={n.surface}>
                <Body tone="section" style={n.bold}>
                  No instant win items right now
                </Body>
                <Body>
                  Items you can buy straight away appear here. Try other filters
                  or check back soon.
                </Body>
                <Button
                  variant="secondary"
                  onPress={() => {
                    setMode('All Deals');
                    setCursor(undefined);
                    setHistory([]);
                  }}
                >
                  See all deals
                </Button>
              </View>
            ) : (
              <View style={n.surface}>
                <Body>No matching deals. Try another search.</Body>
              </View>
            )
          ) : null
        }
        ListFooterComponent={
          <Pagination
            previous={
              history.length
                ? () => {
                    setCursor(history.at(-1));
                    setHistory((h) => h.slice(0, -1));
                  }
                : undefined
            }
            next={
              read.data?.nextCursor
                ? () => {
                    setHistory((h) => [...h, cursor]);
                    setCursor(read.data?.nextCursor ?? undefined);
                  }
                : undefined
            }
          />
        }
      />
    </Page>
  );
}

/**
 * Upcoming: dated lots first; after the last dated page, the lots announced
 * without a date (watch only, 2026-11-14).
 */
async function readUpcomingWithComingSoon(cursor?: string) {
  const page = await readUpcomingDeals(apiUrl, cursor);
  if (page.nextCursor) return page;
  const soon = await readComingSoonDeals(apiUrl, undefined, 50).catch(
    () => null,
  );
  return soon ? { ...page, items: [...page.items, ...soon.items] } : page;
}
