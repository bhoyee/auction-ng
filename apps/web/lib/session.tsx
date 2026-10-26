'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { createAuthClient } from '@auction-ng/api-client/auth';
import type { Profile, TokenResponse } from '@auction-ng/shared';

export const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const realtimeUrl =
  process.env.NEXT_PUBLIC_REALTIME_URL ?? 'http://localhost:4001';
type Session = {
  tokens: TokenResponse | null;
  ready: boolean;
  deviceId: string;
  setTokens: (tokens: TokenResponse | null) => void;
  updateUser: (user: Profile) => void;
  auth: ReturnType<typeof createAuthClient> | null;
};
const Context = createContext<Session | null>(null);
let initialRefresh: Promise<TokenResponse> | undefined;
export function BuyerSession({ children }: { children: ReactNode }) {
  const [tokens, update] = useState<TokenResponse | null>(null);
  const [deviceId, setDeviceId] = useState('');
  const [ready, setReady] = useState(false);
  const [auth, setAuth] = useState<Session['auth']>(null);
  const generation = useRef(0);
  const currentAccess = useRef<string | undefined>(undefined);
  const setTokens = useCallback((value: TokenResponse | null) => {
    if (currentAccess.current !== value?.accessToken) generation.current++;
    currentAccess.current = value?.accessToken;
    update(value);
  }, []);
  const updateUser = useCallback((user: Profile) => {
    update((previous) =>
      previous?.user.id === user.id ? { ...previous, user } : previous,
    );
  }, []);
  useEffect(() => {
    let active = true;
    let id: string;
    try {
      const saved = localStorage.getItem('auction-ng-device');
      id =
        saved && /^[0-9a-f-]{36}$/i.test(saved) ? saved : crypto.randomUUID();
      localStorage.setItem('auction-ng-device', id);
    } catch {
      id = crypto.randomUUID();
    }
    const version = generation.current;
    const refresh = async () => {
      // Let the public catalogue paint in its brand font before loading the
      // account validation bundle. Private views remain gated until refresh.
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      if (!active) return;
      const { createAuthClient } = await import('@auction-ng/api-client/auth');
      if (!active) return;
      const client = createAuthClient(apiUrl, { client: 'web', deviceId: id });
      setDeviceId(id);
      setAuth(client);
      initialRefresh ??= client.refresh();
      return initialRefresh;
    };
    void refresh()
      .then((value) => {
        if (value && active && version === generation.current) setTokens(value);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [setTokens]);
  const accessToken = tokens?.accessToken;
  const expiresInSeconds = tokens?.expiresInSeconds;
  useEffect(() => {
    if (!accessToken || !expiresInSeconds || !auth) return;
    const version = generation.current;
    const timer = setTimeout(
      () => {
        void auth
          .refresh()
          .then((value) => {
            if (version === generation.current) setTokens(value);
          })
          .catch(() => {
            if (version === generation.current) setTokens(null);
          });
      },
      Math.max(1000, (expiresInSeconds - 30) * 1000),
    );
    return () => clearTimeout(timer);
  }, [accessToken, expiresInSeconds, auth, setTokens]);
  return (
    <Context.Provider
      value={{ tokens, ready, deviceId, setTokens, updateUser, auth }}
    >
      {children}
    </Context.Provider>
  );
}
export function useBuyer() {
  const session = useContext(Context);
  if (!session) throw new Error('Buyer session is missing.');
  return session;
}
