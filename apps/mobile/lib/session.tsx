import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import NetInfo from '@react-native-community/netinfo';
import { createAuthClient } from '@auction-ng/api-client/auth';
import type { TokenResponse } from '@auction-ng/shared/auth-session-schemas';
import { createNativeSession } from './native-session';
import { apiUrl } from './config';
const key = 'auction-ng.session.v1';
type Manager = ReturnType<typeof createNativeSession>;
const Context = createContext<{
  manager: Manager;
  session: TokenResponse | null;
  ready: boolean;
  online: boolean;
  error: string;
  retry: () => void;
} | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<TokenResponse | null>(null),
    [ready, setReady] = useState(false),
    [online, setOnline] = useState(true),
    [error, setError] = useState(''),
    [version, setVersion] = useState(0);
  const manager = useMemo(
    () =>
      createNativeSession({
        store: {
          read: () => SecureStore.getItemAsync(key),
          write: (value) =>
            SecureStore.setItemAsync(key, value, {
              keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
            }),
          clear: () => SecureStore.deleteItemAsync(key),
        },
        deviceId: () => Crypto.randomUUID(),
        auth: (deviceId) =>
          createAuthClient(apiUrl, { client: 'mobile', deviceId }),
        changed: setSession,
      }),
    [],
  );
  useEffect(() => {
    let active = true;
    void manager
      .restore()
      .then(() => {
        if (active) {
          setReady(true);
          setError('');
        }
      })
      .catch(() => {
        if (active) {
          setReady(true);
          setError(
            'Your session could not be restored. Check your connection and retry.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [manager, version]);
  useEffect(
    () =>
      NetInfo.addEventListener((state) =>
        setOnline(
          state.isConnected !== false && state.isInternetReachable !== false,
        ),
      ),
    [],
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && manager.identity?.refreshToken)
        void manager.renew().catch(() => {});
    });
    return () => sub.remove();
  }, [manager]);
  return (
    <Context.Provider
      value={{
        manager,
        session,
        ready,
        online,
        error,
        retry: () => setVersion((v) => v + 1),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  const value = useContext(Context);
  if (!value) throw Error('Session provider missing.');
  const owner = value.session?.user.id;
  const manager = useMemo(
    () =>
      new Proxy(value.manager, {
        get(target, property) {
          if (property === 'run')
            return <T,>(
              work: (credentials: {
                accessToken: string;
                deviceId: string;
              }) => Promise<T>,
            ) => {
              if (!owner)
                return Promise.reject(new Error('Sign in before continuing.'));
              return target.run(work, owner);
            };
          return Reflect.get(target, property, target);
        },
      }),
    [value.manager, owner],
  );
  return { ...value, manager };
}
