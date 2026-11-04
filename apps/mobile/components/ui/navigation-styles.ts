import { StyleSheet } from 'react-native';
import { mobileTheme as t } from '@auction-ng/ui';
export const navigationStyles = StyleSheet.create({
  badge: {
    backgroundColor: t.colors['outbid-600'],
    color: t.colors.surface,
    fontFamily: t.fontFamily,
    fontWeight: '700',
  },
  bar: {
    backgroundColor: t.colors['indigo-900'],
    borderTopColor: t.colors['indigo-700'],
    paddingTop: t.spacing.sm,
  },
  item: {
    borderRadius: t.radius.control,
    marginHorizontal: t.spacing.xs,
    minHeight: t.layout.touch,
  },
  label: {
    fontFamily: t.fontFamily,
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: t.spacing.xs,
    marginHorizontal: 0,
    maxWidth: '100%',
  },
  icon: { marginTop: 0, marginBottom: t.spacing.xs },
});
