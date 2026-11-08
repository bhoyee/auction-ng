import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createNativePushClient } from '@auction-ng/api-client/native-push';
import { Platform } from 'react-native';
import { apiUrl } from './config';
import { useRouter } from 'expo-router';
import { useSession } from './session';
import { useBuyerActivity } from './buyer-activity';
import {
  createPushPermissionOnboarding,
  pushPermissionConsentKey,
  pushOptInKey,
  shouldAutoRegisterPush,
} from './push-onboarding';

const onboardPermission = createPushPermissionOnboarding({
  read: (key) => AsyncStorage.getItem(key),
  write: (key, value) => AsyncStorage.setItem(key, value),
  permission: async () =>
    (await import('expo-notifications')).getPermissionsAsync(),
  prepare: async () => {
    if (Platform.OS !== 'android') return;
    const n = await import('expo-notifications');
    await n.setNotificationChannelAsync('auction-updates', {
      name: 'Auction updates',
      importance: n.AndroidImportance.HIGH,
    });
  },
  request: async () =>
    (await import('expo-notifications')).requestPermissionsAsync(),
});

// Remote push stays opt-in; receiving/tapping an alert refreshes account counters.
export function NativePushBridge({
  permissionReady = false,
}: {
  permissionReady?: boolean;
}) {
  const router = useRouter();
  const { session, manager, online } = useSession();
  const { counts, refresh } = useBuyerActivity();
  const handledResponse = useRef<string | undefined>(undefined);
  const [permissionRevision, setPermissionRevision] = useState(0);
  useEffect(() => {
    if (
      !permissionReady ||
      Constants.executionEnvironment === 'storeClient' ||
      Platform.OS === 'web'
    )
      return;
    let active = true;
    void onboardPermission()
      .then(() => {
        if (active) setPermissionRevision((value) => value + 1);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [permissionReady]);
  useEffect(() => {
    if (!session || !online || Constants.executionEnvironment === 'storeClient')
      return;
    let active = true,
      busy = false;
    const owner = session.user.id;
    const restore = async () => {
      if (busy || !active) return;
      busy = true;
      try {
        const choice = await AsyncStorage.getItem(pushOptInKey(owner));
        const consent = await AsyncStorage.getItem(pushPermissionConsentKey);
        if (!shouldAutoRegisterPush(choice, consent)) return;
        const n = await import('expo-notifications');
        if ((await n.getPermissionsAsync()).status !== 'granted') return;
        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        if (!projectId) return;
        const token = await n.getExpoPushTokenAsync({ projectId });
        if (active)
          await manager.run(
            (c) =>
              createNativePushClient(apiUrl, c).register({
                token: token.data,
                platform: Platform.OS === 'ios' ? 'ios' : 'android',
              }),
            owner,
          );
        if (active && manager.session?.user.id === owner && choice === null)
          await AsyncStorage.setItem(pushOptInKey(owner), 'true');
      } catch {
        /* Settings exposes setup failures; never prompt or log tokens here. */
      } finally {
        busy = false;
      }
    };
    void restore();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void restore();
    });
    return () => {
      active = false;
      listener.remove();
    };
  }, [
    session?.user.id,
    session?.accessToken,
    manager,
    online,
    permissionRevision,
  ]);
  useEffect(() => {
    if (Constants.executionEnvironment === 'storeClient') return;
    let active = true;
    const cleanup: (() => void)[] = [];
    void import('expo-notifications')
      .then((notifications) => {
        if (!active) return;
        notifications.setNotificationHandler({
          handleNotification: async (notification) => ({
            shouldShowBanner:
              notification.request.content.data?.type !== 'bidder-message',
            shouldShowList: true,
            shouldPlaySound:
              notification.request.content.data?.type !== 'bidder-message',
            shouldSetBadge: true,
          }),
        });
        const received = notifications.addNotificationReceivedListener(() =>
          refresh(),
        );
        const handleResponse = (
          response: import('expo-notifications').NotificationResponse,
        ) => {
          const identifier = response.notification.request.identifier;
          if (handledResponse.current === identifier) return;
          handledResponse.current = identifier;
          refresh();
          router.push(
            session
              ? '/notifications'
              : { pathname: '/sign-in', params: { next: '/notifications' } },
          );
          notifications.clearLastNotificationResponse();
        };
        const tapped =
          notifications.addNotificationResponseReceivedListener(handleResponse);
        const last = notifications.getLastNotificationResponse();
        if (last) handleResponse(last);
        cleanup.push(
          () => received.remove(),
          () => tapped.remove(),
        );
        const foreground = AppState.addEventListener('change', (state) => {
          if (state === 'active') refresh();
        });
        cleanup.push(() => foreground.remove());
      })
      .catch(() => {});
    return () => {
      active = false;
      cleanup.forEach((stop) => stop());
    };
  }, [session?.user.id, router, refresh]);
  useEffect(() => {
    if (Constants.executionEnvironment === 'storeClient') return;
    void import('expo-notifications')
      .then((n) => n.setBadgeCountAsync(session ? (counts?.unread ?? 0) : 0))
      .catch(() => {});
  }, [session?.user.id, counts?.unread]);
  return null;
}
