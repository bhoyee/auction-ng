import { useState } from 'react';
import { View, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Page, Notice } from '../components/ui/page';
import { Body, Button } from '../components/ui/controls';
import { NativePreferences } from '../components/ui/preferences';
import { n } from '../components/ui/native-styles';
import { usePreferences } from '../lib/preferences';
import { useSession } from '../lib/session';

export default function AppSettings() {
  const { session } = useSession();
  const { dataSaver, setDataSaver } = usePreferences();
  const router = useRouter();
  const [error, setError] = useState('');
  return (
    <Page title="App settings">
      <Notice message={error} onClose={() => setError('')} />
      {session ? (
        <NativePreferences />
      ) : (
        <View style={n.surface}>
          <View style={n.between}>
            <View style={n.grow}>
              <Body style={n.bold}>Data saver</Body>
              <Body tone="secondary">
                Load full item photos only when you choose.
              </Body>
            </View>
            <Switch
              accessibilityLabel="Data saver"
              value={dataSaver}
              onValueChange={(value) =>
                void setDataSaver(value).catch(() =>
                  setError('Could not save your preference. Try again.'),
                )
              }
            />
          </View>
        </View>
      )}
      <View style={n.surface}>
        <Body tone="section">Security and alerts</Body>
        <Body tone="secondary">
          {session
            ? 'Manage two-factor authentication and your account security. Auction alert preferences are above.'
            : 'Sign in to manage two-factor authentication and auction alerts for your account.'}
        </Body>
        <Button
          fullWidth
          onPress={() => router.push(session ? '/profile' : '/sign-in')}
        >
          {session
            ? 'Manage two-factor authentication'
            : 'Sign in to manage settings'}
        </Button>
      </View>
    </Page>
  );
}
