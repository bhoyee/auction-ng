import { useState } from 'react';
import { View, Linking, Platform, Switch } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createNativePushClient } from '@auction-ng/api-client/native-push';
import { Body, Button } from './controls';
import { Notice } from './page';
import { n } from './native-styles';
import { usePreferences } from '../../lib/preferences';
import { useSession } from '../../lib/session';
import { apiUrl } from '../../lib/config';
export function NativePreferences() {
  const { dataSaver, setDataSaver } = usePreferences();
  const { manager } = useSession();
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [enabled, setEnabled] = useState(false);
  async function push() {
    setBusy(true);
    setMessage('');
    try {
      if (enabled) {
        await manager.run((c) => createNativePushClient(apiUrl, c).disable());
        setEnabled(false);
        return;
      }
      const projectId =
        process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
        Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId || Constants.executionEnvironment === 'storeClient') {
        setMessage(
          'Remote push needs an LotVanta development build linked to its Expo project. In-app notifications already work.',
        );
        return;
      }
      const Notifications = await import('expo-notifications');
      if (Platform.OS === 'android')
        await Notifications.setNotificationChannelAsync('auction-updates', {
          name: 'Auction updates',
          importance: Notifications.AndroidImportance.HIGH,
        });
      const permission = await Notifications.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        setMessage(
          'Allow notifications in your phone settings to receive auction alerts.',
        );
        return;
      }
      const token = await Notifications.getExpoPushTokenAsync({ projectId });
      await manager.run((c) =>
        createNativePushClient(apiUrl, c).register({
          token: token.data,
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
        }),
      );
      setEnabled(true);
      await AsyncStorage.setItem('auction-ng.push-opt-in', 'true');
    } catch {
      setMessage(
        'Phone alerts could not be enabled. Check the app build, project configuration and connection.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={n.surface}>
      <Body tone="section">App preferences</Body>
      <View style={n.between}>
        <View style={n.grow}>
          <Body style={n.bold}>Data saver</Body>
          <Body tone="secondary">
            Use cached thumbnails; load full item photos when you choose.
          </Body>
        </View>
        <Switch
          accessibilityLabel="Data saver"
          value={dataSaver}
          onValueChange={(value) =>
            void setDataSaver(value).catch(() =>
              setMessage('Could not save your preference. Retry.'),
            )
          }
        />
      </View>
      <Notice tone="warning" message={message} onClose={() => setMessage('')} />
      <Button busy={busy} onPress={() => void push()}>
        {enabled ? 'Disable phone push alerts' : 'Enable phone push alerts'}
      </Button>
      <Button variant="ghost" onPress={() => void Linking.openSettings()}>
        Open phone notification settings
      </Button>
    </View>
  );
}
