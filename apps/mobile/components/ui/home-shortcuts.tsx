import type { ComponentType } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { Href } from 'expo-router';
import { mobileTheme as t } from '@auction-ng/ui';
import {
  AllDealsArt,
  EndingSoonArt,
  InstantWinArt,
  TopDealsArt,
  UpcomingArt,
} from '../illustrations/deal-art';
import { art } from '../illustrations/palette';

const shortcuts: {
  title: string;
  Art: ComponentType<{ size?: number }>;
  href: Href;
  tint: string;
}[] = [
  {
    title: 'All Deals',
    Art: AllDealsArt,
    href: '/browse',
    tint: art.indigoSoft,
  },
  {
    title: 'Top Deals',
    Art: TopDealsArt,
    href: '/browse?mode=top',
    tint: art.peach,
  },
  {
    title: 'Ending Soon',
    Art: EndingSoonArt,
    href: '/browse?mode=ending',
    tint: art.sky,
  },
  {
    title: 'Instant Win',
    Art: InstantWinArt,
    href: '/browse?mode=instant',
    tint: art.goldLight,
  },
  { title: 'Upcoming', Art: UpcomingArt, href: '/upcoming', tint: art.mint },
];

/**
 * Illustrated deal shortcuts (owner-approved custom art, 2026-11-20), in
 * the website's deals-bar order. Five tiles fill a phone width; larger text
 * sizes scroll sideways instead of squashing the labels.
 */
export function HomeShortcuts({
  onNavigate,
}: {
  onNavigate: (href: Href) => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  const available = Math.min(width, t.layout.content) - t.spacing.lg * 2;
  const tile = Math.max(
    64,
    Math.min(84, (available - t.spacing.sm * 4) / 5) *
      Math.min(fontScale, 1.15),
  );
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      bounces={false}
      contentContainerStyle={s.rail}
      accessibilityLabel="Deal shortcuts"
    >
      {shortcuts.map(({ title, Art, href, tint }) => (
        <Pressable
          key={title}
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityHint="Opens this deal collection"
          onPress={() => onNavigate(href)}
          style={({ pressed }) => [
            s.item,
            { width: tile },
            pressed && s.pressed,
          ]}
        >
          <View
            style={[
              s.tile,
              { width: tile, height: tile, backgroundColor: tint },
            ]}
          >
            <Art size={tile * 0.72} />
          </View>
          <Text style={s.label} numberOfLines={2} maxFontSizeMultiplier={1.3}>
            {title}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  rail: {
    gap: t.spacing.sm,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.xs,
  },
  item: { alignItems: 'center', gap: t.spacing.sm },
  tile: {
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(28, 42, 107, 0.06)',
  },
  label: {
    fontFamily: t.fontFamily,
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: '700',
    color: t.colors['indigo-900'],
    textAlign: 'center',
  },
  pressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
});
