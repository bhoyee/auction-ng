import { ActivityIndicator, Image, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { h } from './home-styles';
import { colors } from './styles';
import wordmark from '../../assets/launch-wordmark.png';

export function LaunchScreen({ error }: { error?: boolean }) {
  return (
    <View style={h.launch} accessibilityLabel="Loading Auction NG">
      <StatusBar style="light" />
      <Image
        source={wordmark}
        style={h.launchImage}
        resizeMode="contain"
        accessibilityLabel="Auction NG. Bid. Win. Save."
      />
      <View style={h.launchBottom}>
        {error ? (
          <Text style={h.launchText}>
            The app could not finish loading. Close Auction NG and try again.
          </Text>
        ) : (
          <ActivityIndicator
            color={colors['danfo-400']}
            accessibilityLabel="Preparing the marketplace"
          />
        )}
      </View>
    </View>
  );
}
