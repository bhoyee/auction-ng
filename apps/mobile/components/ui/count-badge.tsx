import { StyleSheet, Text, View } from 'react-native';
import { mobileTheme as t } from '@auction-ng/ui';
export function CountBadge({
  count = 0,
  overlay = false,
}: {
  count?: number;
  overlay?: boolean;
}) {
  if (count < 1) return null;
  return (
    <View style={[s.badge, overlay && s.overlay]} pointerEvents="none">
      <Text style={s.text} accessibilityLabel={`${count} items`}>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}
const s = StyleSheet.create({
  badge: {
    minWidth: 20,
    minHeight: 20,
    paddingHorizontal: t.spacing.xs,
    borderRadius: t.radius.sheet,
    backgroundColor: t.colors['outbid-600'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: { position: 'absolute', top: -t.spacing.xs, right: -t.spacing.xs },
  text: {
    fontFamily: t.fontFamily,
    ...t.typography.fine,
    fontWeight: '700',
    color: t.colors.surface,
    fontVariant: ['tabular-nums'],
  },
});
