import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import Constants from 'expo-constants';
import { ExternalLink, Settings, Mail } from 'lucide-react-native';
import { mobileTheme as t } from '@auction-ng/ui';
import { useRouter } from 'expo-router';
import { Body, Dialog } from './controls';
import { Notice } from './page';
import { moreStyles as s } from './more-styles';
import { guestMoreLinks, mobileSupportEmail } from '../../lib/more-links';
import { webUrl } from '../../lib/config';

export function GuestMoreContent({
  onClose = () => {},
}: {
  onClose?: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState('');
  async function open(url: string) {
    setError('');
    try {
      await Linking.openURL(url);
    } catch {
      setError(
        'Could not open this link. Check your connection and try again.',
      );
    }
  }
  const version = Constants.expoConfig?.version ?? '0.0.0';
  const build = Constants.nativeBuildVersion;
  return (
    <View style={s.content}>
      <Notice message={error} onClose={() => setError('')} />
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [s.row, pressed && s.pressed]}
        onPress={() => {
          onClose();
          router.push('/settings');
        }}
      >
        <Body style={s.label}>App settings</Body>
        <View style={s.icon}>
          <Settings size={18} color={t.colors['indigo-900']} />
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Email ${mobileSupportEmail}`}
        style={({ pressed }) => [s.row, pressed && s.pressed]}
        onPress={() => void open(`mailto:${mobileSupportEmail}`)}
      >
        <Body style={s.label}>Email</Body>
        <Body style={s.email}>{mobileSupportEmail}</Body>
        <Mail size={18} color={t.colors['slate-600']} />
      </Pressable>
      {guestMoreLinks.map((item) => (
        <Pressable
          key={item.path}
          accessibilityRole="link"
          accessibilityHint="Opens in your browser"
          style={({ pressed }) => [s.row, pressed && s.pressed]}
          onPress={() => void open(new URL(item.path, webUrl).href)}
        >
          <Body style={s.label}>{item.label}</Body>
          <View style={s.icon}>
            <ExternalLink size={18} color={t.colors['indigo-900']} />
          </View>
        </Pressable>
      ))}
      <View style={s.footer}>
        <Body style={s.footerText}>
          App version {version}
          {Constants.executionEnvironment !== 'storeClient' && build
            ? ` · Build ${build}`
            : ''}
        </Body>
        <Body style={s.footerText}>
          © {new Date().getFullYear()} Auction NG. All rights reserved.
        </Body>
      </View>
    </View>
  );
}

export function GuestMoreSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog title="More" presentation="sheet" open={open} onClose={onClose}>
      <GuestMoreContent onClose={onClose} />
    </Dialog>
  );
}
