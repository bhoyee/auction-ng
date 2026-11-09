import { StyleSheet } from 'react-native';
import { mobileTheme as t } from '@auction-ng/ui';
export const countdownStyles = StyleSheet.create({
  photo: {
    position: 'absolute',
    bottom: t.spacing.sm,
    left: t.spacing.sm,
    right: t.spacing.sm,
    alignItems: 'center',
  },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    backgroundColor: t.colors['indigo-900'],
    borderRadius: t.radius.control,
    paddingVertical: t.spacing.sm,
    paddingHorizontal: t.spacing.xs,
    overflow: 'hidden',
  },
  cell: {
    paddingHorizontal: t.spacing.xs,
    flexShrink: 1,
    alignItems: 'center',
  },
  photoTimer: { alignSelf: 'center' },
  divider: { borderLeftWidth: 1, borderColor: t.colors['indigo-700'] },
  text: {
    color: t.colors.surface,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    maxWidth: '100%',
  },
  urgent: { backgroundColor: t.colors['outbid-600'] },
  large: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingVertical: t.spacing.lg,
  },
  largeCell: { flex: 1, paddingHorizontal: t.spacing.xs },
  largeText: { fontSize: 20, lineHeight: 26 },
});
