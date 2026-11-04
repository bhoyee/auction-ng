import { ConditionBadge } from '../components/ui/condition-badge';
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
import { Heart } from 'lucide-react-native';
import {
  createCatalogueClient,
  createSearchClient,
} from '@auction-ng/api-client';
import { readUpcomingDeals } from '@auction-ng/api-client/prebids';
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
}: {
  lot: CatalogueLot;
  upcoming?: boolean;
}) {
  const activity = useBuyerActivity();
  const router = useRouter();
  const { manager, session } = useSession();
  const live = useLiveLot(lot.id, !upcoming);
  const now = useTick();
  const [error, setError] = useState(''),
    [watched, setWatched] = useState(false);
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
        <AuctionCountdown
          photo
          endsAt={Date.parse(
            upcoming ? lot.startsAt : (live.lot?.endsAt ?? lot.endsAt),
          )}
          serverNow={now}
          live={live.status === 'live'}
          upcoming={upcoming}
        />
      </Pressable>
      <View style={n.overlay}>
        <ConditionBadge condition={lot.condition} />
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
          variant={upcoming ? 'primary' : 'success'}
          size="small"
          onPress={() => router.push(`/lots/${lot.id}`)}
        >
          {upcoming ? 'View and pre-bid' : 'Bid now'}
        </Button>
      </View>
    </View>
  );
}
export function photoUrl(value?: string | null) {
  if (!value) return undefined;
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
  const [mode, setMode] = useState('All Deals'),
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
    setMode(
      params.mode === 'top'
        ? 'Top Deals'
        : params.mode === 'ending'
          ? 'Ending Soon'
          : 'All Deals',
    );
    setCursor(undefined);
    setHistory([]);
  }, [params.mode]);
  const scheduled = upcoming || mode === 'Upcoming';
  const read = useLiveRead(
    () =>
      scheduled
        ? readUpcomingDeals(apiUrl, cursor)
        : search
          ? createSearchClient(apiUrl).search({ q: search, limit: 20, cursor })
          : browseDeals(apiUrl, {
              ...filters,
              limit: 20,
              cursor,
              section:
                mode === 'Top Deals'
                  ? 'top-deals'
                  : mode === 'Ending Soon'
                    ? 'ending-soon'
                    : 'all',
            }),
    [scheduled, mode, search, cursor, JSON.stringify(filters)],
  );
  return (
    <Page
      title={scheduled ? 'Upcoming Deals' : 'Browse auctions'}
      back={false}
      scroll={false}
    >
      <View style={n.content}>
        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
          <View
            style={{
              minWidth: Math.max(
                width - 48,
                t.layout.touch * 10 * Math.max(1, fontScale),
              ),
            }}
          >
            <Tabs
              label="Auction collections"
              items={['All Deals', 'Top Deals', 'Ending Soon', 'Upcoming'].map(
                (value) => ({
                  value,
                  label: value,
                  panel: null,
                }),
              )}
              value={upcoming ? 'Upcoming' : mode}
              onChange={(value) => {
                if (upcoming && value !== 'Upcoming') {
                  router.replace({
                    pathname: '/browse',
                    params: {
                      mode:
                        value === 'Top Deals'
                          ? 'top'
                          : value === 'Ending Soon'
                            ? 'ending'
                            : 'all',
                    },
                  });
                  return;
                }
                setMode(value);
                setCursor(undefined);
                setHistory([]);
              }}
            />
          </View>
        </ScrollView>

        {!scheduled && (
          <>
            <TextInput
              accessibilityLabel="Search auctions"
              placeholder="Search for phones, electronics and more"
              style={n.search}
              value={query}
              onChangeText={(text) => {
                setQuery(text);
                setCursor(undefined);
                setHistory([]);
              }}
            />
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
            <ProductCard lot={item} upcoming={scheduled} />
          </View>
        )}
        onRefresh={read.refresh}
        refreshing={false}
        ListEmptyComponent={
          read.data ? (
            <View style={n.surface}>
              <Body>No matching auctions. Try another search.</Body>
            </View>
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
