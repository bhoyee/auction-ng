import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { Href } from 'expo-router';
import {
  ChevronRight,
  PackageCheck,
  Tag,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native';
import { mobileTheme as t } from '@auction-ng/ui';
import { createWalletClient } from '@auction-ng/api-client';
import { ApiError } from '@auction-ng/api-client/auth';
import { createBuyerClient } from '@auction-ng/api-client/buyers';
import { useSession } from '../../lib/session';
import { useLiveRead } from '../../lib/live-read';
import { useBuyerActivity } from '../../lib/buyer-activity';
import { apiUrl } from '../../lib/config';
import { cardAccents } from '../illustrations/palette';
import { homeCardCopy } from '../../lib/home-cards';

type Card = {
  key: string;
  icon: LucideIcon;
  accent: string;
  label: string;
  value: string;
  detail: string;
  href: Href;
  hint: string;
};

/**
 * Swipeable summary cards on the signed-in home (owner request,
 * 2026-11-20): wallet balance, items awaiting pickup and estimated savings
 * against retail. Each opens the matching screen.
 */
export function HomeCards({
  onNavigate,
}: {
  onNavigate: (href: Href) => void;
}) {
  const { manager, session } = useSession();
  const { counts } = useBuyerActivity();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const wallet = useLiveRead(
    () =>
      manager.run(async (c) => {
        try {
          return await createWalletClient(apiUrl, c).getBalance();
        } catch (error: unknown) {
          if (error instanceof ApiError && error.status === 404)
            return { availableKobo: 0 };
          throw error;
        }
      }),
    [session?.user.id],
    30000,
  );
  const savings = useLiveRead(
    () => manager.run((c) => createBuyerClient(apiUrl, c).savings()),
    [session?.user.id],
    60000,
  );
  const copy = homeCardCopy({
    availableKobo: wallet.data?.availableKobo,
    awaitingPickup: counts?.awaitingPickup ?? undefined,
    savedKobo: savings.data?.savedKobo,
    paidItems: savings.data?.paidItems,
  });
  const cards: Card[] = [
    {
      key: 'wallet',
      icon: Wallet,
      accent: cardAccents.gold,
      ...copy.wallet,
      href: '/wallet',
      hint: 'Opens your wallet',
    },
    {
      key: 'pickup',
      icon: PackageCheck,
      accent: cardAccents.sky,
      ...copy.pickup,
      href: '/orders',
      hint: 'Opens items awaiting pickup',
    },
    {
      key: 'savings',
      icon: Tag,
      accent: cardAccents.green,
      ...copy.savings,
      href: '/purchases',
      hint: 'Opens your purchase history',
    },
  ];
  const cardWidth = Math.min(width - t.spacing.lg * 2 - 28, 420);
  const step = cardWidth + t.spacing.md;
  return (
    <View style={s.section}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        disableIntervalMomentum
        contentContainerStyle={s.rail}
        onScroll={(event) =>
          setPage(
            Math.max(
              0,
              Math.min(
                cards.length - 1,
                Math.round(event.nativeEvent.contentOffset.x / step),
              ),
            ),
          )
        }
        scrollEventThrottle={32}
        accessibilityLabel="Your account summary"
      >
        {cards.map((card) => (
          <Pressable
            key={card.key}
            accessibilityRole="button"
            accessibilityLabel={`${card.label}: ${card.value}. ${card.detail}`}
            accessibilityHint={card.hint}
            onPress={() => onNavigate(card.href)}
            style={({ pressed }) => [
              s.card,
              { width: cardWidth },
              pressed && s.pressed,
            ]}
          >
            <View style={[s.chip, { backgroundColor: card.accent + '26' }]}>
              <card.icon size={24} color={card.accent} />
            </View>
            <View style={s.copy}>
              <Text style={[s.label, { color: card.accent }]} numberOfLines={1}>
                {card.label}
              </Text>
              <Text
                style={s.value}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {card.value}
              </Text>
              <Text style={s.detail} numberOfLines={1}>
                {card.detail}
              </Text>
            </View>
            <ChevronRight size={22} color={t.colors['indigo-50']} />
          </Pressable>
        ))}
      </ScrollView>
      <View style={s.dots} accessible={false}>
        {cards.map((card, index) => (
          <View key={card.key} style={[s.dot, index === page && s.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  section: { gap: t.spacing.sm },
  rail: { paddingHorizontal: t.spacing.lg, gap: t.spacing.md },
  card: {
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.lg,
    borderRadius: 22,
    backgroundColor: t.colors['indigo-900'],
    shadowColor: t.colors.ink,
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  chip: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  label: {
    fontFamily: t.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  value: {
    fontFamily: t.fontFamily,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '500',
    color: t.colors.surface,
    fontVariant: ['tabular-nums'],
  },
  detail: {
    fontFamily: t.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: t.colors['indigo-50'],
    opacity: 0.8,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: t.colors.line,
  },
  dotActive: { width: 18, backgroundColor: t.colors['indigo-900'] },
});
