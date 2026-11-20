import { StyleSheet, View } from 'react-native';
import { Trophy } from 'lucide-react-native';
import { mobileTheme as t } from '@auction-ng/ui';
import { formatNaira } from '@auction-ng/shared/money';
import { Body } from './controls';

/**
 * The fixed Instant Win price on a card, as on the website (owner decision
 * 2026-11-10). Tax is added at checkout, so the label says so.
 */
export function InstantWinBadge({
  priceKobo,
}: {
  priceKobo: number | null | undefined;
}) {
  if (priceKobo == null || !Number.isSafeInteger(priceKobo) || priceKobo <= 0)
    return null;
  return (
    <View
      style={s.badge}
      accessible
      accessibilityLabel={`Instant win price ${formatNaira(priceKobo)}, tax added at checkout`}
    >
      <Trophy size={12} color={t.colors.ink} />
      <Body style={s.text}>{formatNaira(priceKobo)}</Body>
    </View>
  );
}
const s = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
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
