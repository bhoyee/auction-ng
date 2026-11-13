import { StyleSheet, View } from 'react-native';
import { mobileTheme as t } from '@auction-ng/ui';
import type { CatalogueLot } from '@auction-ng/shared';
import { Body } from './controls';
import { useConditionDisplay } from '../../lib/conditions';

export function ConditionBadge({
  condition,
}: {
  condition: CatalogueLot['condition'];
}) {
  // Label and colour follow Lot setup (owner decision 2026-11-13).
  const { label, palette } = useConditionDisplay(condition);
  return (
    <View style={[s.badge, { backgroundColor: palette.backgroundColor }]}>
      <Body style={[s.text, { color: palette.color }]}>{label}</Body>
    </View>
  );
}
const s = StyleSheet.create({
  badge: {
    maxWidth: '100%',
    alignSelf: 'flex-start',
    borderRadius: t.radius.control,
    paddingHorizontal: t.spacing.sm,
    paddingVertical: t.spacing.xs,
  },
  text: { fontSize: 12, lineHeight: 16, fontWeight: '700', flexShrink: 1 },
});
