import { StyleSheet, View } from 'react-native';
import { mobileTheme as t } from '@auction-ng/ui';
import type { CatalogueLot } from '@auction-ng/shared';
import { Body } from './controls';

export function ConditionBadge({
  condition,
}: {
  condition: CatalogueLot['condition'];
}) {
  const palette = t.conditionBadges[condition];
  return (
    <View style={[s.badge, { backgroundColor: palette.backgroundColor }]}>
      <Body style={[s.text, { color: palette.color }]}>
        {condition.replaceAll('_', ' ').toUpperCase()}
      </Body>
    </View>
  );
}
const s = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: t.radius.control,
    paddingHorizontal: t.spacing.sm,
    paddingVertical: t.spacing.xs,
  },
  text: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
});
