import { StyleSheet, View } from 'react-native';
import { mobileTheme as t } from '@auction-ng/ui';
import { retailDiscountPercent } from '@auction-ng/ui/presentation';
import { Body } from './controls';

/**
 * "−60%" below the retail estimate (owner decision 2026-11-14). Pass no
 * price while the live price is unconfirmed: a stale saving is never shown.
 */
export function DiscountBadge({
  priceKobo,
  retailKobo,
}: {
  priceKobo: number | null | undefined;
  retailKobo: number;
}) {
  if (priceKobo == null) return null;
  const percent = retailDiscountPercent(priceKobo, retailKobo);
  if (percent === undefined) return null;
  return (
    <View
      style={s.badge}
      accessible
      accessibilityLabel={`${percent}% below retail estimate`}
    >
      <Body style={s.text}>−{percent}%</Body>
    </View>
  );
}
const s = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: t.radius.control,
    paddingHorizontal: t.spacing.sm,
    paddingVertical: t.spacing.xs,
    backgroundColor: t.colors['danfo-400'],
  },
  text: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    color: t.colors.ink,
    fontVariant: ['tabular-nums'],
  },
});
