import { useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import type { Href } from 'expo-router';
import {
  ChevronRight,
  Clock3,
  Gavel,
  Heart,
  ShoppingBag,
  Sparkles,
} from 'lucide-react-native';
import { mobileTheme as t } from '@auction-ng/ui';
import { Body } from './controls';
import { shortcutStyles as s } from './home-shortcut-styles';

export function HomeShortcuts({
  signedIn,
  onNavigate,
}: {
  signedIn: boolean;
  onNavigate: (href: Href) => void;
}) {
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const { fontScale } = useWindowDimensions();
  const shortcutWidth = t.layout.touch * 2 * Math.max(1, fontScale);
  const scrolls = contentWidth > viewportWidth + 1 && viewportWidth > 0;
  const shortcuts = [
    { title: 'All auctions', icon: Gavel, href: '/browse', tone: 'primary' },
    {
      title: 'Top deals',
      icon: Sparkles,
      href: '/browse?mode=top',
      tone: 'deal',
    },
    {
      title: 'Ending soon',
      icon: Clock3,
      href: '/browse?mode=ending',
      tone: 'brand',
    },
    {
      title: signedIn ? 'My bids' : 'Upcoming',
      icon: signedIn ? Heart : ShoppingBag,
      href: signedIn ? '/bids' : '/upcoming',
      tone: 'soft',
    },
  ] as const;
  return (
    <View style={s.section}>
      <View style={s.heading}>
        <Body style={s.title}>Explore auctions</Body>
        {scrolls && (
          <View
            style={s.hint}
            accessible
            accessibilityLabel="Swipe left or right for more auction shortcuts"
          >
            <Body style={s.hintText}>Swipe to explore</Body>
            <ChevronRight size={14} color={t.colors['slate-600']} />
          </View>
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={false}
        contentContainerStyle={[s.rail, !scrolls && s.fillRail]}
        onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
        onContentSizeChange={(width) => setContentWidth(width)}
      >
        {shortcuts.map((shortcut) => {
          const light =
            shortcut.tone === 'primary' || shortcut.tone === 'brand';
          return (
            <Pressable
              key={shortcut.title}
              accessibilityRole="button"
              accessibilityLabel={shortcut.title}
              accessibilityHint="Opens this auction collection"
              onPress={() => onNavigate(shortcut.href)}
              style={({ pressed }) => [
                s.button,
                { width: shortcutWidth, minWidth: shortcutWidth },
                s[shortcut.tone],
                !scrolls && s.fillButton,
                pressed && s.pressed,
              ]}
            >
              <View style={[s.icon, s[`${shortcut.tone}Icon`]]}>
                <shortcut.icon
                  size={20}
                  strokeWidth={1.8}
                  color={light ? t.colors['danfo-400'] : t.colors['indigo-900']}
                />
              </View>
              <Body numberOfLines={2} style={[s.label, light && s.light]}>
                {shortcut.title}
              </Body>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
