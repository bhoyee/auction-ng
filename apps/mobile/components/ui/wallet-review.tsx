import { StyleSheet, View } from 'react-native';
import { Wallet } from 'lucide-react-native';
import { mobileTheme as t } from '@auction-ng/ui';
import { formatNaira } from '@auction-ng/shared';
import { Body } from './controls';

export function WalletReview({
  rows,
  totalLabel,
  totalKobo,
  credit = false,
}: {
  rows: readonly { label: string; amountKobo: number }[];
  totalLabel: string;
  totalKobo: number;
  credit?: boolean;
}) {
  return (
    <View style={walletReviewStyles.content}>
      <View style={walletReviewStyles.breakdown}>
        {rows.map((row) => (
          <View key={row.label} style={walletReviewStyles.row}>
            <Body tone="secondary" style={walletReviewStyles.grow}>
              {row.label}
            </Body>
            <Body style={walletReviewStyles.amount}>
              {formatNaira(row.amountKobo)}
            </Body>
          </View>
        ))}
      </View>
      <View
        style={[walletReviewStyles.total, credit && walletReviewStyles.credit]}
      >
        <View style={walletReviewStyles.row}>
          <Wallet size={19} color={t.colors.surface} />
          <Body style={walletReviewStyles.white}>{totalLabel}</Body>
        </View>
        <Body
          style={walletReviewStyles.totalAmount}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {formatNaira(totalKobo)}
        </Body>
      </View>
    </View>
  );
}
export const walletReviewStyles = StyleSheet.create({
  content: { gap: t.spacing.lg, paddingVertical: t.spacing.sm },
  breakdown: { gap: t.spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  grow: { flex: 1, minWidth: 0 },
  amount: {
    ...t.typography.secondary,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    maxWidth: '58%',
    flexShrink: 1,
  },
  total: {
    backgroundColor: t.colors['indigo-900'],
    borderRadius: t.radius.card,
    padding: t.spacing.lg,
    gap: t.spacing.sm,
  },
  credit: { backgroundColor: t.colors['win-600'] },
  white: {
    color: t.colors.surface,
    ...t.typography.secondary,
    fontWeight: '600',
  },
  totalAmount: {
    ...t.typography.title,
    color: t.colors.surface,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  footer: { gap: t.spacing.md },
  bank: {
    backgroundColor: t.colors.canvas,
    borderRadius: t.radius.control,
    padding: t.spacing.md,
    gap: t.spacing.xs,
  },
});
