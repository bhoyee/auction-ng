import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import {
  createRealtimeClient,
  type RealtimeClient,
  type LiveLotState,
} from '@auction-ng/api-client/realtime';
import { realtimeUrl } from './config';
import { useSession } from './session';
const Context = createContext<RealtimeClient | null>(null);
const empty: LiveLotState = {
  status: 'connecting',
  lot: null,
  clockOffsetMs: 0,
};
const idle = () => () => {};
export function NativeRealtimeProvider({ children }: { children: ReactNode }) {
  const { manager, session, online } = useSession();
  const [foreground, setForeground] = useState(true);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) =>
      setForeground(state === 'active'),
    );
    return () => listener.remove();
  }, []);
  const client = useMemo(
    () =>
      foreground && online
        ? createRealtimeClient(realtimeUrl, {
            onOutbid: () => {
              void import('expo-haptics')
                .then((h) =>
                  h.notificationAsync(h.NotificationFeedbackType.Warning),
                )
                .catch(() => {});
            },
            credentials: session
              ? () => {
                  const current = manager.session;
                  if (!current) throw Error('Sign in again.');
                  return {
                    accessToken: current.accessToken,
                    deviceId: manager.identity?.deviceId ?? '',
                  };
                }
              : undefined,
          })
        : null,
    [manager, session?.user.id, foreground, online],
  );
  useEffect(() => () => client?.close(), [client]);
  useEffect(() => {
    client?.reauthenticate();
  }, [client, session?.accessToken]);
  return <Context.Provider value={client}>{children}</Context.Provider>;
}
export function useLiveLot(id: string, enabled = true) {
  const client = useContext(Context);
  useEffect(
    () => (enabled ? client?.watchLot(id) : undefined),
    [client, id, enabled],
  );
  return useSyncExternalStore(
    client?.subscribe ?? idle,
    () => (enabled ? (client?.getSnapshot(id) ?? empty) : empty),
    () => empty,
  );
}
