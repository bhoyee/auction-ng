import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Check, Minus, Trophy, X } from 'lucide-react-native';
import { mobileTheme as t } from '@auction-ng/ui';
import type { CardBidStatus } from '@auction-ng/shared/card-bid-status';

const copy: Record<CardBidStatus, string> = {
  Winning: 'You are winning this deal',
  Outbid: 'You have been outbid',
  Won: 'You won this deal',
  Lost: 'Another buyer won this deal',
};
const tone: Record<CardBidStatus, string> = {
  Winning: t.colors['win-600'],
  Won: t.colors['win-600'],
  Outbid: t.colors['outbid-600'],
  Lost: t.colors['slate-600'],
};
const icons = { Winning: Check, Won: Trophy, Outbid: X, Lost: Minus };
/** The status colour mixed into white, like the website's tinted bar. */
function tint(hex: string, amount = 0.14) {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  const mix = (shift: number) =>
    Math.round(((value >> shift) & 255) * amount + 255 * (1 - amount));
  return `rgb(${mix(16)}, ${mix(8)}, ${mix(0)})`;
}

/**
 * The signed-in buyer's own position on an item photo, matching the website
 * (owner decision 2026-11-22). Turning to Outbid plays one short pulse,
 * skipped when the phone asks for reduced motion.
 */
export function BidStatusPill({
  status,
  compact = false,
  align = 'center',
}: {
  status: CardBidStatus;
  compact?: boolean;
  align?: 'center' | 'flex-start';
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => active && setReduceMotion(value))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (status !== 'Outbid' || reduceMotion) return;
    scale.setValue(0.85);
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.04,
        duration: 270,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [status, reduceMotion, scale]);
  const Icon = icons[status];
  const colour = tone[status];
  return (
    <Animated.View
      accessible
      accessibilityRole="text"
      accessibilityLabel={copy[status]}
      accessibilityLiveRegion="polite"
      style={[
        s.pill,
        compact && s.compact,
        {
          alignSelf: align,
          backgroundColor: tint(colour),
          transform: [{ scale }],
        },
      ]}
    >
      <Text
        numberOfLines={1}
        style={[s.text, compact && s.compactText, { color: colour }]}
      >
        {status === 'Outbid' ? 'Outbid!' : status}
      </Text>
      <View
        style={[s.icon, compact && s.compactIcon, { backgroundColor: colour }]}
      >
        <Icon
          size={compact ? 13 : 16}
          strokeWidth={2.75}
          color={t.colors.surface}
        />
      </View>
    </Animated.View>
  );
}
const s = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minWidth: 160,
    minHeight: 40,
    paddingLeft: 22,
    paddingRight: 8,
    paddingVertical: 5,
    borderRadius: t.radius.sheet,
    shadowColor: t.colors.ink,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  compact: {
    minWidth: 128,
    minHeight: 32,
    paddingLeft: 16,
    paddingRight: 6,
    gap: 10,
  },
  text: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  compactText: { fontSize: 15, lineHeight: 20 },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactIcon: { width: 22, height: 22, borderRadius: 11 },
});

/** The pill centred over the photo, just above the photo countdown. */
export function PhotoBidStatus({
  status,
  bottom = 44,
  compact = true,
}: {
  status: CardBidStatus | undefined;
  bottom?: number;
  compact?: boolean;
}) {
  if (!status) return null;
  return (
    <View pointerEvents="none" style={[photo.wrap, { bottom }]}>
      <BidStatusPill status={status} compact={compact} />
    </View>
  );
}
const photo = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: t.spacing.sm,
    right: t.spacing.sm,
    alignItems: 'center',
  },
});
