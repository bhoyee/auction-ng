import { PreferencesProvider } from '../lib/preferences';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LaunchScreen } from '../components/ui/launch-screen';
import { launchStyles } from '../components/ui/launch-styles';
import { SessionProvider, useSession } from '../lib/session';
import { NativeRealtimeProvider } from '../lib/realtime';
import { NativeClockProvider } from '../lib/clock';
import { BuyerActivityProvider } from '../lib/buyer-activity';
import { NativePushBridge } from '../lib/push-bridge';
void SplashScreen.preventAutoHideAsync().catch(() => {});
function LaunchOverlay({ onFinished }: { onFinished: () => void }) {
  const { ready } = useSession();
  const [visible, setVisible] = useState(true);
  const finish = useCallback(() => {
    setVisible(false);
    onFinished();
  }, [onFinished]);
  return visible ? <LaunchScreen ready={ready} onFinished={finish} /> : null;
}
export default function RootLayout() {
  const [launchComplete, setLaunchComplete] = useState(false);
  const finishLaunch = useCallback(() => setLaunchComplete(true), []);
  const [loaded, error] = useFonts({
    'Schibsted Grotesk': require('../../../packages/ui/fonts/schibsted-grotesk.ttf'),
  });
  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);
  if (error || !loaded) return <LaunchScreen error={!!error} />;
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <BuyerActivityProvider>
          <NativePushBridge permissionReady={launchComplete} />
          <PreferencesProvider>
            <NativeRealtimeProvider>
              <NativeClockProvider>
                <View style={launchStyles.host}>
                  <StatusBar style="dark" />
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen
                      name="sign-in"
                      options={{
                        presentation:
                          Platform.OS === 'android' ? 'card' : 'modal',
                      }}
                    />
                  </Stack>
                  <LaunchOverlay onFinished={finishLaunch} />
                </View>
              </NativeClockProvider>
            </NativeRealtimeProvider>
          </PreferencesProvider>
        </BuyerActivityProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
