'use client';
import { useCallback, useEffect, useState } from 'react';
import { useBuyer } from './session';
export function useWalletRead<T>(
  read: (credentials: { accessToken: string; deviceId: string }) => Promise<T>,
  notifyBalance = false,
) {
  const { tokens, deviceId } = useBuyer();
  const [snapshot, setSnapshot] = useState<{
    owner: string;
    deviceId: string;
    read: typeof read;
    data: T;
  }>();
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const data =
    snapshot?.owner === tokens?.user.id &&
    snapshot?.deviceId === deviceId &&
    snapshot?.read === read
      ? snapshot.data
      : undefined;
  useEffect(() => {
    if (!tokens) return;
    let active = true,
      running = false,
      queued = false;
    const refresh = async () => {
      if (!navigator.onLine) {
        if (active) setError(true);
        return;
      }
      if (document.hidden) return;
      if (running) {
        queued = true;
        return;
      }
      running = true;
      try {
        const value = await read({ accessToken: tokens.accessToken, deviceId });
        if (active) {
          setSnapshot({ owner: tokens.user.id, deviceId, read, data: value });
          setError(false);
          if (notifyBalance)
            window.dispatchEvent(
              new Event('auction-ng-wallet-balance-refresh'),
            );
        }
      } catch {
        if (active) setError(true);
      } finally {
        running = false;
        if (active && queued) {
          queued = false;
          void refresh();
        }
      }
    };
    void refresh();
    const listener = () => void refresh();
    const timer = setInterval(listener, 15000);
    window.addEventListener('focus', listener);
    window.addEventListener('online', listener);
    window.addEventListener('auction-ng-wallet-change', listener);
    document.addEventListener('visibilitychange', listener);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', listener);
      window.removeEventListener('online', listener);
      window.removeEventListener('auction-ng-wallet-change', listener);
      document.removeEventListener('visibilitychange', listener);
    };
  }, [tokens, deviceId, read, version, notifyBalance]);
  return { data, error, reload };
}
