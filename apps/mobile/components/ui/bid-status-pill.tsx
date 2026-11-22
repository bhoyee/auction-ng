import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Check, CircleX, Minus, Trophy } from 'lucide-react-native';
import { mobileTheme as t } from '@auction-ng/ui';
import type { CardBidStatus } from '@auction-ng/shared/card-bid-status';

const copy: Record<CardBidStatus, string> = {
  Winning: 'You are winning this deal',
  Outbid: 'You have been outbid',
  Won: 'You won this deal',
  Lost: 'Another buyer won this deal',
};
const background: Record<CardBidStatus, string> = {
  Winning: t.colors['win-600'],
  Won: t.colors['win-600'],
  Outbid: t.colors['outbid-600'],
  Lost: t.colors['slate-600'],
};
const icons = { Winning: Check, Won: Trophy, Outbid: CircleX, Lost: Minus };

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
        toValue: 1.08,
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
          backgroundColor: background[status],
          transform: [{ scale }],
        },
      ]}
    >
      <Icon
        size={compact ? 13 : 15}
        strokeWidth={2.5}
        color={t.colors.surface}
      />
      <Text style={[s.text, compact && s.compactText]}>{status}</Text>
    </Animated.View>
  );
}
const s = StyleSheet.create({
  pill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 30,
    paddingLeft: 10,
    paddingRight: 14,
    paddingVertical: 4,
    borderRadius: t.radius.sheet,
    shadowColor: t.colors.ink,
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  compact: { minHeight: 24, paddingLeft: 8, paddingRight: 10, gap: 4 },
  text: {
    color: t.colors.surface,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  compactText: { fontSize: 12, lineHeight: 16 },
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
