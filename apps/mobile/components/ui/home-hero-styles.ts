import { StyleSheet } from 'react-native';
import { mobileTheme as t } from '@auction-ng/ui';

export const heroStyles = StyleSheet.create({
  frame: {
    backgroundColor: t.colors['indigo-900'],
    borderRadius: t.radius.sheet,
    overflow: 'hidden',
  },
  slide: { borderRadius: 0, minHeight: 232 },
  guideSlide: {
    backgroundColor: t.colors['indigo-700'],
    minHeight: 232,
    padding: t.spacing.lg,
    gap: t.spacing.md,
    justifyContent: 'center',
  },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.lg },
  step: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  stepLabel: {
    color: t.colors.surface,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: t.spacing.lg,
    paddingRight: t.spacing.xs,
  },
  caption: { flex: 1, color: t.colors.surface, fontSize: 12, lineHeight: 16 },
  control: {
    minWidth: t.layout.touch,
    minHeight: t.layout.touch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: t.radius.badge,
    backgroundColor: t.colors.surface,
  },
  selectedDot: { width: 24, backgroundColor: t.colors['danfo-400'] },
});
