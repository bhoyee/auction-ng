import { StyleSheet } from 'react-native';
import { mobileTheme as t } from '@auction-ng/ui';

export const bidHistoryStyles = StyleSheet.create({
  tabs: { flexGrow: 0 },
  tabRail: { gap: t.spacing.sm },
  tab: {
    minHeight: t.layout.touch,
    paddingHorizontal: t.spacing.lg,
    justifyContent: 'center',
    borderRadius: t.radius.control,
    backgroundColor: t.colors['indigo-50'],
  },
  selected: { backgroundColor: t.colors['indigo-900'] },
  label: { ...t.typography.secondary, fontWeight: '700' },
  white: { color: t.colors.surface },
  title: { ...t.typography.secondary, fontWeight: '700' },
  statuses: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: t.spacing.sm,
    paddingVertical: t.spacing.xs,
    borderRadius: t.radius.control,
    backgroundColor: t.colors['indigo-50'],
  },
  success: { backgroundColor: t.colors['win-600'] },
  danger: { backgroundColor: t.colors['outbid-600'] },
  live: { backgroundColor: t.colors['indigo-900'] },
  amountPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    backgroundColor: t.colors.canvas,
    padding: t.spacing.md,
    borderRadius: t.radius.control,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    borderBottomWidth: 1,
    borderColor: t.colors.line,
    paddingBottom: t.spacing.md,
  },
  columns: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: t.spacing.md,
    paddingVertical: t.spacing.sm,
  },
  muted: { color: t.colors['slate-600'] },
});
