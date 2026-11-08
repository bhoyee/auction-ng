import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { Bell, X } from 'lucide-react-native';
import { mobileTheme as theme } from '@auction-ng/ui';
import {
  createBuyerClient,
  createForegroundMessageTracker,
  FOREGROUND_MESSAGE_DISPLAY_MS,
  FOREGROUND_MESSAGE_POLL_MS,
  foregroundMessageCopy,
  type ForegroundMessage,
} from '@auction-ng/api-client/buyers';
import { useSession } from '../../lib/session';
import { useBuyerActivity } from '../../lib/buyer-activity';
import { apiUrl } from '../../lib/config';
import { Body, Button, Dialog } from './controls';
import { styles as s, colors } from './styles';

export function BuyerMessageAlerts() {
  const { session, manager, online } = useSession(),
    activity = useBuyerActivity();
  const owner = session?.user.role === 'buyer' ? session.user.id : undefined;
  const router = useRouter(),
    path = usePathname(),
    insets = useSafeAreaInsets();
  const latest = useRef({ owner, path, online, refresh: activity.refresh });
  latest.current = { owner, path, online, refresh: activity.refresh };
  const [notice, setNotice] = useState<{
    owner: string;
    message: ForegroundMessage;
  }>();
  const [selected, setSelected] = useState<{
    owner: string;
    message: ForegroundMessage;
  }>();
  useEffect(() => {
    setNotice(undefined);
    setSelected(undefined);
    if (!owner) return;
    const tracker = createForegroundMessageTracker();
    let active = true,
      running = false;
    const read = async () => {
      if (
        !active ||
        running ||
        !latest.current.online ||
        AppState.currentState !== 'active'
      )
        return;
      running = true;
      try {
        const page = await manager.run(
          (c) => createBuyerClient(apiUrl, c).bidderMessages({ limit: 1 }),
          owner,
        );
        if (!active || latest.current.owner !== owner) return;
        const fresh = tracker.observe(page.items),
          message = fresh.at(-1);
        if (message) {
          latest.current.refresh();
          if (latest.current.path !== '/notifications')
            setNotice({ owner, message });
        }
      } catch {
        /* Silent retry; the existing notification inbox remains the source of truth. */
      } finally {
        running = false;
      }
    };
    void read();
    const timer = setInterval(() => void read(), FOREGROUND_MESSAGE_POLL_MS);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void read();
      else setNotice(undefined);
    });
    return () => {
      active = false;
      clearInterval(timer);
      listener.remove();
    };
  }, [owner, manager]);
  const current = notice?.owner === owner ? notice : undefined;
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(
      () => setNotice(undefined),
      FOREGROUND_MESSAGE_DISPLAY_MS,
    );
    return () => clearTimeout(timer);
  }, [current]);
  const message =
    selected && selected.owner === owner ? selected.message : undefined;
  async function openMessage() {
    if (!current || latest.current.owner !== current.owner) return;
    setSelected(current);
    setNotice(undefined);
    try {
      await manager.run(
        (c) =>
          createBuyerClient(apiUrl, c).readNotifications([current.message.id]),
        current.owner,
      );
      latest.current.refresh();
    } catch {
      /* The message remains readable if its read receipt cannot be confirmed. */
    }
  }
  return (
    <>
      {current && (
        <View
          pointerEvents="box-none"
          style={[s.messageOverlay, { top: insets.top + theme.spacing.sm }]}
        >
          <View accessibilityLiveRegion="polite" style={s.messageCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Read new message from LotVanta"
              style={({ pressed }) => [
                s.messageMain,
                pressed && s.messagePressed,
              ]}
              onPress={() => void openMessage()}
            >
              <Bell size={22} color={colors['danfo-400']} />
              <View style={s.grow}>
                <Body style={s.messageTitle}>
                  {foregroundMessageCopy.title}
                </Body>
                <Body tone="fine" style={s.messageText}>
                  {foregroundMessageCopy.summary}
                </Body>
                <Body tone="fine" style={s.messageAction}>
                  {foregroundMessageCopy.action}
                </Body>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss message notification"
              style={s.messageClose}
              onPress={() => setNotice(undefined)}
            >
              <X size={20} color={colors.surface} />
            </Pressable>
          </View>
        </View>
      )}
      <Dialog
        open={!!message}
        title="Message from LotVanta"
        onClose={() => setSelected(undefined)}
      >
        {message && (
          <>
            <Body>{message.title}</Body>
            <Button
              onPress={() => {
                setSelected(undefined);
                if (message.href.startsWith('/lots/'))
                  router.push({
                    pathname: '/lots/[id]',
                    params: { id: message.href.slice(6) },
                  });
                else router.push('/notifications');
              }}
            >
              View item
            </Button>
          </>
        )}
      </Dialog>
    </>
  );
}
