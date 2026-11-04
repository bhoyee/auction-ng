import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Gavel, Wallet } from 'lucide-react-native';
import { formatNaira, type calculateInvoiceLine } from '@auction-ng/shared';
import { mobileTheme as t } from '@auction-ng/ui';
import { Body } from './controls';

export function BidReviewSummary({
  title,
  thumbnail,
  automatic,
  scheduled,
  invoice,
  rules,
}: {
  title: string;
  thumbnail?: string;
  automatic: boolean;
  scheduled: boolean;
  invoice: ReturnType<typeof calculateInvoiceLine>;
  rules: { premiumBps: number; vatBps: number };
}) {
  const rows = [
    [
      automatic ? 'Private spending limit' : 'Your bid',
      formatNaira(invoice.hammerKobo),
    ],
    [
      `Service charge (${rules.premiumBps / 100}%)`,
      formatNaira(invoice.premiumKobo),
    ],
    ['Lot fee', formatNaira(invoice.lotFeeKobo)],
    [`VAT on fees (${rules.vatBps / 100}%)`, formatNaira(invoice.vatKobo)],
  ];
  return (
    <View style={s.content}>
      <View style={s.item}>
        {thumbnail ? (
          <Image
            source={thumbnail}
            style={s.photo}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <Gavel size={24} color={t.colors['indigo-900']} />
        )}
        <View style={s.grow}>
          <Body style={s.itemTitle} numberOfLines={2}>
            {title}
          </Body>
          <Body tone="secondary">
            {scheduled
              ? 'Upcoming auction · Pre-bid'
              : automatic
                ? 'Automatic spending limit'
                : 'Bid full amount'}
          </Body>
        </View>
      </View>
      <View style={s.breakdown}>
        <Body tone="secondary" style={s.sectionLabel}>
          Your cost breakdown
        </Body>
        {rows.map(([label, value]) => (
          <View key={label} style={s.row}>
            <Body tone="secondary" style={s.grow}>
              {label}
            </Body>
            <Body style={s.amount}>{value}</Body>
          </View>
        ))}
      </View>
      <View style={s.totalPanel}>
        <View style={s.totalLabel}>
          <Wallet size={18} color={t.colors.surface} />
          <Body style={s.white}>Total wallet reservation</Body>
        </View>
        <Body
          style={s.total}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          numberOfLines={1}
        >
          {formatNaira(invoice.totalKobo)}
        </Body>
        <Body tone="secondary" style={s.white}>
          {automatic
            ? 'Includes your private limit and all auction fees.'
            : 'Includes your bid and all auction fees.'}
        </Body>
      </View>
      <Body tone="secondary" style={s.note}>
        {scheduled
          ? 'Your pre-bid activates when the auction goes live. It does not buy the item now.'
          : automatic
            ? 'We bid only as much as needed, up to your private limit. Your final total depends on the winning price.'
            : 'Funds are reserved for this bid and released if you are outbid.'}
      </Body>
    </View>
  );
}
export const bidReviewStyles = StyleSheet.create({
  footer: {
    gap: t.spacing.sm,
    paddingTop: t.spacing.lg,
    borderTopWidth: 1,
    borderColor: t.colors.line,
  },
});
const s = StyleSheet.create({
  content: { gap: t.spacing.lg, paddingVertical: t.spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    padding: t.spacing.md,
    backgroundColor: t.colors.canvas,
    borderRadius: t.radius.card,
  },
  photo: {
    width: 64,
    height: 64,
    borderRadius: t.radius.control,
    backgroundColor: t.colors.surface,
  },
  grow: { flex: 1, minWidth: 0 },
  itemTitle: {
    fontWeight: '700',
    ...t.typography.secondary,
    marginBottom: t.spacing.xs,
  },
  breakdown: { gap: t.spacing.lg, paddingVertical: t.spacing.sm },
  sectionLabel: { fontWeight: '600', color: t.colors.ink },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.md },
  amount: {
    ...t.typography.secondary,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    flexShrink: 1,
  },
  totalPanel: {
    backgroundColor: t.colors['indigo-900'],
    borderRadius: t.radius.card,
    padding: t.spacing.lg,
    gap: t.spacing.sm,
  },
  totalLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    flexWrap: 'wrap',
  },
  total: {
    ...t.typography.title,
    fontWeight: '800',
    color: t.colors.surface,
    fontVariant: ['tabular-nums'],
  },
  white: { color: t.colors.surface },
  note: { color: t.colors['slate-600'] },
});
