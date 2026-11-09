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
import { createSessionRenewal } from './session-renewal';
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
  renewSession: (failedToken?: string) => Promise<TokenResponse | null>;
};
const Context = createContext<Session | null>(null);
export function BuyerSession({ children }: { children: ReactNode }) {
  const [tokens, update] = useState<TokenResponse | null>(null);
  const [deviceId, setDeviceId] = useState('');
  const [ready, setReady] = useState(false);
  const [auth, setAuth] = useState<Session['auth']>(null);
  const generation = useRef(0);
  const latest = useRef<TokenResponse | null>(null);
  const authRef = useRef<Session['auth']>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const deviceRef = useRef('');
  const renewal = useRef<ReturnType<typeof createSessionRenewal> | null>(null);
  const currentAccess = useRef<string | undefined>(undefined);
  const setTokens = useCallback((value: TokenResponse | null) => {
    if (currentAccess.current !== value?.accessToken) generation.current++;
    currentAccess.current = value?.accessToken;
    latest.current = value;
    update(value);
  }, []);
  if (!renewal.current)
    renewal.current = createSessionRenewal({
      current: () => latest.current,
      version: () => generation.current,
      apply: setTokens,
      refresh: async () => {
        if (!authRef.current) throw new Error('Sign in again.');
        return authRef.current.refresh();
      },
      lock: async (run) =>
        await (navigator.locks
          ? navigator.locks.request('auction-ng-buyer-refresh', run)
          : run()),
      announce: (value) =>
        channel.current?.postMessage({
          deviceId: deviceRef.current,
          tokens: value,
        }),
    });
  const renewSession = useCallback(async (failedToken?: string) => {
    if (!renewal.current) throw new Error('Sign in again.');
    return renewal.current(failedToken);
  }, []);
  useEffect(() => {
    if (!deviceId || typeof BroadcastChannel === 'undefined') return;
    const connection = new BroadcastChannel('auction-ng-buyer-session');
    channel.current = connection;
    connection.onmessage = (event: MessageEvent<unknown>) => {
      const raw = event.data;
      if (
        !raw ||
        typeof raw !== 'object' ||
        !('deviceId' in raw) ||
        raw.deviceId !== deviceId ||
        !('tokens' in raw)
      )
        return;
      const version = generation.current;
      void import('@auction-ng/shared/auth-session-schemas').then(
        ({ tokenResponseSchema }) => {
          const parsed = tokenResponseSchema.safeParse(raw.tokens);
          if (
            parsed.success &&
            version === generation.current &&
            latest.current?.user.id === parsed.data.user.id
          )
            setTokens(parsed.data);
        },
      );
    };
    return () => {
      connection.close();
      channel.current = null;
    };
  }, [deviceId, setTokens]);
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
      deviceRef.current = id;
      authRef.current = client;
      setDeviceId(id);
      setAuth(client);
      return renewSession();
    };
    void refresh()
      .catch(() => {})
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [setTokens, renewSession]);
  const accessToken = tokens?.accessToken;
  const expiresInSeconds = tokens?.expiresInSeconds;
  useEffect(() => {
    if (!accessToken || !expiresInSeconds || !auth) return;
    const deadline =
      Date.now() + Math.max(1000, (expiresInSeconds - 30) * 1000);
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      if (!active || !navigator.onLine) return;
      void renewSession(accessToken).catch((cause: unknown) => {
        if (!active || currentAccess.current !== accessToken) return;
        if (
          cause &&
          typeof cause === 'object' &&
          'status' in cause &&
          cause.status === 401
        )
          setTokens(null);
        else timer = setTimeout(refresh, 15000);
      });
    };
    const resume = () => {
      if (!document.hidden && Date.now() >= deadline) refresh();
    };
    timer = setTimeout(refresh, Math.max(0, deadline - Date.now()));
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [accessToken, expiresInSeconds, auth, renewSession, setTokens]);
  return (
    <Context.Provider
      value={{
        tokens,
        ready,
        deviceId,
        setTokens,
        updateUser,
        auth,
        renewSession,
      }}
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
