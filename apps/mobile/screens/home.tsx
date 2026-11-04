import { ConditionBadge } from '../components/ui/condition-badge';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import {
  ArrowRight,
  Bell,
  ChevronRight,
  Heart,
  Search,
  Trophy,
} from 'lucide-react-native';
import { createCatalogueClient } from '@auction-ng/api-client';
import { readUpcomingDeals } from '@auction-ng/api-client/prebids';
import { createBuyerClient } from '@auction-ng/api-client/buyers';
import {
  formatNaira,
  imageRules,
  merchandisingRules,
  type CatalogueLot,
} from '@auction-ng/shared';
import { AuctionCountdown } from '../components/ui/auction-countdown';
import { HomeShortcuts } from '../components/ui/home-shortcuts';
import { Body, Button } from '../components/ui/controls';
import { Notice } from '../components/ui/page';
import { h, homeGridItem } from '../components/ui/home-styles';
import { colors } from '../components/ui/styles';
import { useSession } from '../lib/session';
import { useLiveRead } from '../lib/live-read';
import { useLiveLot } from '../lib/realtime';
import { useTick } from '../lib/clock';
import { apiUrl } from '../lib/config';
import { photoUrl } from './catalogue';
import logo from '../assets/lotvanta-logo.png';
import { HomeHero } from '../components/ui/home-hero';
import { homePrice } from '../lib/home-price';

function HomeLot({
  lot,
  upcoming = false,
  watching,
  watchDisabled,
  onWatch,
}: {
  lot: CatalogueLot;
  upcoming?: boolean;
  watching?: boolean;
  watchDisabled: boolean;
  onWatch: () => void;
}) {
  const router = useRouter();
  const live = useLiveLot(lot.id, !upcoming);
  const now = useTick();
  const ends = Date.parse(
    upcoming ? lot.startsAt : (live.lot?.endsAt ?? lot.endsAt),
  );
  const fresh = live.status === 'live';
  const price = upcoming
    ? lot.startPriceKobo
    : homePrice(lot.startPriceKobo, live);
  if (!upcoming && now > 0 && ends <= now) return null;
  const grade = lot.condition;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${lot.title}`}
      onPress={() => router.push(`/lots/${lot.id}`)}
      style={({ pressed }) => [h.card, pressed && h.pressed]}
    >
      <View>
        <Image
          source={photoUrl(lot.thumbnail?.thumbnailUrl)}
          style={h.photo}
          contentFit="cover"
          cachePolicy="memory-disk"
          accessibilityLabel={lot.title}
        />
        <View
          style={[
            h.photoBadge,
            {
              paddingHorizontal: 0,
              paddingVertical: 0,
              backgroundColor: 'transparent',
            },
          ]}
        >
          <ConditionBadge condition={grade} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            watching ? 'Remove from watchlist' : 'Add to watchlist'
          }
          disabled={watchDisabled}
          accessibilityState={{ disabled: watchDisabled }}
          style={({ pressed }) => [h.watch, pressed && h.pressed]}
          onPress={(event) => {
            event.stopPropagation();
            onWatch();
          }}
        >
          <Heart
            size={19}
            color={colors['indigo-900']}
            fill={watching ? colors['danfo-400'] : 'none'}
          />
        </Pressable>
        {lot.fixedPriceKobo != null && (
          <View style={[h.fixedBadge, h.row]}>
            <Trophy size={14} color={colors.ink} />
            <Body style={h.guideText}>{formatNaira(lot.fixedPriceKobo)}</Body>
          </View>
        )}
        <AuctionCountdown
          photo
          endsAt={ends}
          serverNow={now}
          live={fresh}
          upcoming={upcoming}
        />
      </View>
      <View style={h.cardCopy}>
        <Body numberOfLines={2} style={h.cardTitle}>
          {lot.title}
        </Body>
        <View style={h.priceRow}>
          <Body
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            style={h.price}
          >
            {(upcoming || fresh) && price != null
              ? formatNaira(price)
              : 'Checking price'}
          </Body>
          <Body style={h.mutedPrice}>{formatNaira(lot.retailPriceKobo)}</Body>
        </View>
      </View>
      <View style={h.bidLink}>
        <Body numberOfLines={1} style={[h.bidText, h.grow]}>
          {upcoming ? 'View pre-bid' : 'Bid now'}
        </Body>
        <ArrowRight size={16} color={colors['indigo-900']} />
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { session, manager, online } = useSession();
  const [watchBusy, setWatchBusy] = useState(false);
  const [watchMessage, setWatchMessage] = useState<{
    message: string;
    tone: 'success' | 'error';
  }>();
  const { width } = useWindowDimensions();
  const read = useLiveRead(async () => {
    const api = createCatalogueClient(apiUrl);
    const [live, featured, upcoming] = await Promise.all([
      api.list({ limit: 50 }),
      api.list({ limit: 50, topDeals: true }),
      readUpcomingDeals(apiUrl),
    ]);
    return {
      live: [
        ...new Map(
          [...live.items, ...featured.items].map((lot) => [lot.id, lot]),
        ).values(),
      ],
      upcoming: upcoming.items,
      serverTime: live.serverTime,
    };
  });
  const tick = useTick();
  const now = tick || Date.parse(read.data?.serverTime ?? '') || 0;
  const source =
    read.data?.live.filter((lot) => Date.parse(lot.endsAt) > now) ?? [];
  const closing = source
    .filter(
      (lot) =>
        Date.parse(lot.endsAt) - now <= merchandisingRules.closingWindowMs,
    )
    .slice(0, 4);
  const ending = source
    .filter(
      (lot) =>
        Date.parse(lot.endsAt) - now > merchandisingRules.closingWindowMs &&
        Date.parse(lot.endsAt) - now <= imageRules.endingSoonMs,
    )
    .sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt))
    .slice(0, 4);
  const used = new Set([...closing, ...ending].map((lot) => lot.id));
  const top = source
    .filter((lot) => lot.isTopDeal && !used.has(lot.id))
    .sort((a, b) => a.topDealOrder - b.topDealOrder)
    .slice(0, 4);
  const upcoming =
    read.data?.upcoming
      .filter((lot) => Date.parse(lot.startsAt) > now)
      .slice(0, 4) ?? [];
  const visibleIds = [...closing, ...top, ...ending, ...upcoming].map(
    (lot) => lot.id,
  );
  const watches = useLiveRead(
    () =>
      session && visibleIds.length
        ? manager.run((credentials) =>
            createBuyerClient(apiUrl, credentials).watched(visibleIds),
          )
        : Promise.resolve({ lotIds: [] as string[] }),
    [visibleIds.join(',')],
  );
  async function toggleWatch(lot: CatalogueLot) {
    if (!session)
      return router.push({
        pathname: '/sign-in',
        params: { next: `/lots/${lot.id}` },
      });
    if (watchBusy || !watches.data) return;
    setWatchBusy(true);
    const watching = !watches.data.lotIds.includes(lot.id);
    try {
      await manager.run((credentials) =>
        createBuyerClient(apiUrl, credentials).watch(lot.id, watching),
      );
      watches.refresh();
      setWatchMessage({
        message: watching
          ? 'Added to your watchlist.'
          : 'Removed from your watchlist.',
        tone: 'success',
      });
    } catch {
      setWatchMessage({
        message:
          'Could not update your watchlist. Check your connection and retry.',
        tone: 'error',
      });
    } finally {
      setWatchBusy(false);
    }
  }
  const go = (path: Href) => router.push(path);
  const sections = [
    {
      title: 'Closing now',
      items: closing,
      href: '/browse?mode=ending',
      urgent: true,
    },
    {
      title: 'Top deals',
      items: top,
      href: '/browse?mode=top',
    },
    {
      title: 'Ending soon',
      items: ending,
      href: '/browse?mode=ending',
    },
    {
      title: 'Upcoming deals',
      items: upcoming,
      href: '/upcoming',
      upcoming: true,
    },
  ];
  return (
    <SafeAreaView style={h.page} edges={['top', 'left', 'right']}>
      <View style={h.header}>
        <View style={h.between}>
          <Image
            source={logo}
            style={h.brandLogo}
            contentFit="contain"
            accessibilityLabel="LotVanta"
          />
          <View style={h.row}>
            <Pressable
              style={({ pressed }) => [h.icon, pressed && h.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Watchlist"
              onPress={() => go('/watchlist')}
            >
              <Heart color={colors['indigo-900']} size={21} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [h.icon, pressed && h.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() => go('/notifications')}
            >
              <Bell color={colors['indigo-900']} size={21} />
            </Pressable>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search auctions"
          style={({ pressed }) => [h.search, pressed && h.pressed]}
          onPress={() => go('/browse')}
        >
          <Search size={19} color={colors['indigo-900']} />
          <Body style={[h.searchText, h.grow]}>Search auctions</Body>
          <View style={h.searchAction}>
            <ArrowRight size={17} color={colors.surface} />
          </View>
        </Pressable>
        {watchMessage && (
          <Notice
            message={watchMessage.message}
            tone={watchMessage.tone}
            onClose={() => setWatchMessage(undefined)}
          />
        )}
      </View>
      <ScrollView
        contentContainerStyle={h.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[h.inset, h.section]}>
          {session && (
            <View>
              <Body style={h.greeting}>
                {`Hello, ${session.user.name.split(' ')[0]}.`}
              </Body>
              <Body style={h.subtitle}>Your next find is waiting.</Body>
            </View>
          )}
          {!session && <HomeHero onStart={() => go('/sign-in')} />}
          <HomeShortcuts signedIn={!!session} onNavigate={go} />
          {!online && (
            <Notice
              tone="warning"
              message="You are offline. Reconnect to see current prices and place bids."
            />
          )}
          {!!read.error && (
            <View style={h.state}>
              <Notice message={read.error} />
              <Button onPress={read.refresh}>Try again</Button>
            </View>
          )}
        </View>
        {!read.data && !read.error && (
          <View
            style={[h.inset, h.section]}
            accessibilityLabel="Loading auctions"
          >
            <Body style={h.title}>Finding your next win</Body>
            <View style={h.row}>
              {[0, 1].map((key) => (
                <View key={key} style={[h.card, h.grow]}>
                  <View style={h.skeletonImage} />
                  <View style={h.cardCopy}>
                    <View style={h.skeletonLine} />
                    <View style={h.skeletonLine} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
        {sections.map(
          (section) =>
            section.items.length > 0 && (
              <View
                key={section.title}
                style={section.urgent ? h.closing : h.section}
              >
                <View style={h.inset}>
                  <View style={h.between}>
                    <View style={h.row}>
                      {section.urgent && <View style={h.liveDot} />}
                      <Body style={h.title}>{section.title}</Body>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`See all ${section.title}`}
                      onPress={() => go(section.href as Href)}
                      style={({ pressed }) => [h.seeAll, pressed && h.pressed]}
                    >
                      <Body style={h.seeAllText}>See all</Body>
                      <ChevronRight size={16} color={colors['indigo-900']} />
                    </Pressable>
                  </View>
                </View>
                {section.urgent || section.upcoming ? (
                  <FlashList
                    key={`${section.title}-${Math.round(width)}`}
                    horizontal
                    data={section.items}
                    keyExtractor={(lot) => lot.id}
                    contentContainerStyle={h.railContent}
                    showsHorizontalScrollIndicator={false}
                    renderItem={({ item }) => (
                      <View
                        style={[
                          h.railItem,
                          {
                            width:
                              width >= 768
                                ? (Math.min(width, 1400) - 80) / 4
                                : width * 0.46,
                          },
                        ]}
                      >
                        <HomeLot
                          lot={item}
                          upcoming={section.upcoming}
                          watching={watches.data?.lotIds.includes(item.id)}
                          watchDisabled={
                            watchBusy || (!!session && !watches.data)
                          }
                          onWatch={() => void toggleWatch(item)}
                        />
                      </View>
                    )}
                  />
                ) : (
                  <View style={h.grid}>
                    {section.items.map((lot) => (
                      <View key={lot.id} style={homeGridItem(width)}>
                        <HomeLot
                          lot={lot}
                          watching={watches.data?.lotIds.includes(lot.id)}
                          watchDisabled={
                            watchBusy || (!!session && !watches.data)
                          }
                          onWatch={() => void toggleWatch(lot)}
                        />
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ),
        )}
        {read.data && source.length === 0 && (
          <View style={h.inset}>
            <View style={h.state}>
              <Body style={h.title}>Fresh finds are on the way.</Body>
              <Body style={h.subtitle}>
                Take a look at Upcoming Deals or check back for new auctions.
              </Body>
              <Button onPress={() => go('/upcoming')}>
                Explore upcoming deals
              </Button>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
