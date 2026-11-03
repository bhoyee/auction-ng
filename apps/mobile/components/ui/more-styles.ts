import { StyleSheet } from 'react-native';
import { mobileTheme as t } from '@auction-ng/ui';

export const moreStyles = StyleSheet.create({
  content: { gap: t.spacing.sm },
  row: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    borderBottomWidth: 1,
    borderColor: t.colors.line,
    paddingVertical: t.spacing.md,
  },
  label: { flex: 1, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  email: {
    color: t.colors['slate-600'],
    fontSize: 14,
    lineHeight: 20,
    flexShrink: 1,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: t.radius.sheet,
    backgroundColor: t.colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: t.colors['indigo-50'] },
  footer: {
    alignItems: 'center',
    gap: t.spacing.xs,
    paddingVertical: t.spacing.xl,
  },
  footerText: {
    color: t.colors['slate-600'],
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
