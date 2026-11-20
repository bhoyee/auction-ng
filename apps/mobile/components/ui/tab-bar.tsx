import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/tabs';
import * as Haptics from 'expo-haptics';
import {
  Ellipsis,
  Heart,
  Home,
  LogIn,
  Search,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import { mobileTheme as t } from '@auction-ng/ui';
import { tabBarLayout } from '../../lib/tab-bar-layout';

const icons: Record<string, LucideIcon> = {
  index: Home,
  browse: Search,
  watchlist: Heart,
  account: Ellipsis,
};

/**
 * GiddyDeal tab bar (owner request, 2026-11-20): Home, Browse, a raised
 * gold Watchlist button with the watching count, Account and More. It
 * emits the same tabPress events as the default bar, so each screen's
 * listeners (sign-in redirect, the More sheet) keep working.
 */
export function GiddyTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
  insets,
  signedIn,
  watching,
}: BottomTabBarProps & { signedIn: boolean; watching?: number }) {
  const bottom = Math.max(insets.bottom, t.spacing.sm);
  return (
    <View
      style={[s.bar, { paddingBottom: bottom }]}
      accessibilityRole="tablist"
    >
      {state.routes.map((route, index) => {
        const focused = index === state.index;
        const title = descriptors[route.key]?.options.title ?? route.name;
        const centre = route.name === 'watchlist';
        const Icon =
          route.name === 'login'
            ? signedIn
              ? UserRound
              : LogIn
            : (icons[route.name] ?? Home);
        const press = () => {
          void Haptics.selectionAsync().catch(() => undefined);
          const event = emitter.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) navigateToTab(route.key);
        };
        const count = centre ? tabBarLayout.badge(watching) : undefined;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={
              centre && watching ? `${title}, ${watching} watching` : title
            }
            onPress={press}
            onLongPress={() =>
              emitter.emit({ type: 'tabLongPress', target: route.key })
            }
            style={({ pressed }) => [s.item, pressed && s.pressed]}
          >
            {centre ? (
              <View style={s.centreWrap}>
                <View style={[s.centre, focused && s.centreActive]}>
                  <Icon
                    size={26}
                    color={t.colors['indigo-900']}
                    fill={focused ? t.colors['indigo-900'] : 'none'}
                  />
                  {count && (
                    <View style={s.badge}>
                      <Text style={s.badgeText} maxFontSizeMultiplier={1.2}>
                        {count}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ) : (
              <View style={[s.pill, focused && s.pillActive]}>
                <Icon
                  size={22}
                  color={
                    focused ? t.colors['danfo-400'] : t.colors['indigo-50']
                  }
                />
              </View>
            )}
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={[s.label, focused && s.labelActive]}
            >
              {title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const CENTRE = 60;
const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: t.colors['indigo-900'],
    borderTopLeftRadius: t.radius.promotion / 1.6,
    borderTopRightRadius: t.radius.promotion / 1.6,
    paddingTop: t.spacing.sm,
    paddingHorizontal: t.spacing.xs,
    shadowColor: t.colors.ink,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  item: {
    flex: 1,
    minHeight: t.layout.touch + 12,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
  },
  pressed: { opacity: 0.7 },
  pill: {
    minWidth: 48,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: { backgroundColor: t.colors['indigo-700'] },
  label: {
    fontFamily: t.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: t.colors['indigo-50'],
  },
  labelActive: { color: t.colors['danfo-400'] },
  centreWrap: { height: 32, alignItems: 'center', justifyContent: 'flex-end' },
  centre: {
    width: CENTRE,
    height: CENTRE,
    borderRadius: CENTRE / 2,
    marginBottom: 2,
    backgroundColor: t.colors['danfo-400'],
    borderWidth: 4,
    borderColor: t.colors['indigo-900'],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: t.colors['danfo-400'],
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  centreActive: { transform: [{ scale: 1.06 }] },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    backgroundColor: t.colors['outbid-600'],
    borderWidth: 2,
    borderColor: t.colors['indigo-900'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: t.fontFamily,
    color: t.colors.surface,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
