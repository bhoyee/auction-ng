import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@auction-ng/ui';

export default function Home() {
  return (
    <SafeAreaView style={styles.page}>
      <Text style={styles.wordmark}>Auction NG</Text>
      <Text accessibilityRole="header" style={styles.title}>
        Auctions are on the way
      </Text>
      <Text style={styles.body}>
        We’re preparing daily liquidation auctions for Nigerian buyers. There
        are no lots to browse yet.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: tokens.colors.canvas,
    padding: tokens.spacing.lg,
  },
  wordmark: {
    fontFamily: tokens.fontFamily,
    ...tokens.typography.section,
    fontWeight: '600',
    color: tokens.colors['indigo-900'],
    marginBottom: tokens.spacing['2xl'],
  },
  title: {
    fontFamily: tokens.fontFamily,
    fontSize: tokens.typography.title.fontSize - 2,
    lineHeight: tokens.typography.title.lineHeight - 2,
    fontWeight: '700',
    color: tokens.colors.ink,
    marginBottom: tokens.spacing.lg,
  },
  body: {
    fontFamily: tokens.fontFamily,
    ...tokens.typography.body,
    color: tokens.colors['slate-600'],
  },
});
