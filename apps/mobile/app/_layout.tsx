import { Slot } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { tokens } from '@auction-ng/ui';

export default function RootLayout() {
  const [loaded, error] = useFonts({
    'Schibsted Grotesk': require('../../../packages/ui/fonts/schibsted-grotesk.ttf'),
  });
  if (error)
    return (
      <View>
        <Text>Font could not load. Close Auction NG and open it again.</Text>
      </View>
    );
  if (!loaded)
    return (
      <View
        style={{ flex: 1, backgroundColor: tokens.colors.canvas }}
        accessibilityLabel="Loading Auction NG"
      />
    );
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Slot />
    </SafeAreaProvider>
  );
}
