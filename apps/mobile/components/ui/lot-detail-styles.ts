import { StyleSheet } from 'react-native';
import { mobileTheme as t } from '@auction-ng/ui';

export const detailStyles = StyleSheet.create({
  priceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: t.spacing.md,
  },
  priceValue: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '50%',
    minWidth: 0,
    maxWidth: '100%',
  },
  conditionSlot: { flexShrink: 0, maxWidth: '100%', alignSelf: 'center' },
  copy: { fontSize: 14, lineHeight: 21 },
  history: { backgroundColor: t.colors['indigo-50'] },
  gallery: {
    overflow: 'hidden',
    borderRadius: t.radius.card,
    backgroundColor: t.colors.surface,
  },
  photo: { width: '100%', aspectRatio: 1 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.spacing.sm,
  },
  control: {
    minWidth: t.layout.touch,
    minHeight: t.layout.touch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  join: {
    minHeight: t.layout.touch,
    padding: t.spacing.md,
    borderRadius: t.radius.control,
    alignItems: 'center',
    backgroundColor: t.colors['win-600'],
  },
  joinText: { color: t.colors.surface, fontWeight: '700', fontSize: 16 },
  pressed: { opacity: t.opacity.disabled },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
  badge: {
    borderRadius: t.radius.control,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    backgroundColor: t.colors['indigo-900'],
  },
  green: { backgroundColor: t.colors['win-600'] },
  red: { backgroundColor: t.colors['outbid-600'] },
  yellow: { backgroundColor: t.colors['danfo-400'] },
  badgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: t.colors.surface,
  },
  dark: { color: t.colors.ink },
});
