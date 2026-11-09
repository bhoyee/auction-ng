import { View, StyleSheet } from 'react-native';
import { mobileTheme as t } from '@auction-ng/ui';
import { Body } from './controls';
import { withdrawalBadge } from '../../lib/withdrawal-presentation';
export function WithdrawalStatusBadge({
  status,
  providerIssue = false,
}: {
  status: Parameters<typeof withdrawalBadge>[0];
  providerIssue?: boolean;
}) {
  const badge = withdrawalBadge(status, providerIssue);
  return (
    <View style={[s.badge, s[badge.tone]]}>
      <Body tone="fine" style={[s.text, badge.tone === 'warning' && s.dark]}>
        {badge.label}
      </Body>
    </View>
  );
}
const s = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: t.radius.control,
    paddingHorizontal: t.spacing.sm,
    paddingVertical: t.spacing.xs,
    flexShrink: 1,
  },
  text: { color: t.colors.surface, fontWeight: '700' },
  dark: { color: t.colors.ink },
  neutral: { backgroundColor: t.colors['slate-600'] },
  warning: { backgroundColor: t.colors['danfo-400'] },
  brand: { backgroundColor: t.colors['indigo-900'] },
  success: { backgroundColor: t.colors['win-600'] },
  danger: { backgroundColor: t.colors['outbid-600'] },
});
