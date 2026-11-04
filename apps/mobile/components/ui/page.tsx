import { View, Pressable, ActivityIndicator } from 'react-native';
import { KeyboardFormScroll } from './keyboard-form-scroll';
import { useRouter } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type ReactNode } from 'react';
import { Body, Button } from './controls';
import { colors } from './styles';
import { n } from './native-styles';
import { useSession } from '../../lib/session';
export function Page({
  title,
  children,
  back = true,
  scroll = true,
}: {
  title: string;
  children: ReactNode;
  back?: boolean;
  scroll?: boolean;
}) {
  const router = useRouter();
  const { online } = useSession();
  return (
    <SafeAreaView style={n.page} edges={['top', 'left', 'right']}>
      <View style={[n.between, n.bar]}>
        {back && (
          <Pressable
            style={n.icon}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace('/')
            }
          >
            <ChevronLeft color={colors['indigo-900']} />
          </Pressable>
        )}
        <Body tone="section" style={[n.grow, n.bold]}>
          {title}
        </Body>
      </View>
      {!online && (
        <View style={n.warning}>
          <Body tone="secondary">
            You are offline. Prices and payments need a fresh connection.
          </Body>
        </View>
      )}
      {scroll ? <KeyboardFormScroll>{children}</KeyboardFormScroll> : children}
    </SafeAreaView>
  );
}
export function Notice({
  message,
  tone = 'error',
  onClose,
  compact = false,
}: {
  message: string;
  tone?: 'error' | 'success' | 'warning';
  onClose?: () => void;
  compact?: boolean;
}) {
  if (!message) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        n.row,
        tone === 'error'
          ? n.danger
          : tone === 'success'
            ? n.success
            : n.warning,
      ]}
    >
      <Body
        tone={compact ? 'secondary' : 'body'}
        style={[n.grow, tone !== 'warning' && n.white]}
      >
        {message}
      </Body>
      {onClose && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss message"
          style={n.icon}
          onPress={onClose}
        >
          <X
            color={tone === 'warning' ? colors.ink : colors.surface}
            size={18}
          />
        </Pressable>
      )}
    </View>
  );
}
export function Loading() {
  return (
    <ActivityIndicator
      color={colors['indigo-900']}
      accessibilityLabel="Loading"
    />
  );
}
export function Private({ children }: { children: ReactNode }) {
  const { session, ready, error, retry } = useSession();
  const router = useRouter();
  if (!ready) return <Loading />;
  if (!session)
    return (
      <View style={n.surface}>
        <Body tone="section">Your account, all in one place.</Body>
        <Body>
          Sign in to bid, save your favourite lots and manage your orders.
        </Body>
        {error && <Notice message={error} />}
        <Button onPress={() => router.push('/sign-in')}>Sign in</Button>
        {error && <Button onPress={retry}>Retry connection</Button>}
      </View>
    );
  return children;
}
export function Pagination({
  previous,
  next,
}: {
  previous?: () => void;
  next?: () => void;
}) {
  return (
    <View style={n.between}>
      <Button variant="secondary" disabled={!previous} onPress={previous}>
        Previous
      </Button>
      <Button disabled={!next} onPress={next}>
        Next
      </Button>
    </View>
  );
}
