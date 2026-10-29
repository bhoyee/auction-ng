'use client';
import { useEffect, useState } from 'react';
import { apiUrl, useBuyer } from './session';
export function useWatchlistCount() {
  const { tokens, deviceId } = useBuyer();
  const userId = tokens?.user.id;
  const accessToken = tokens?.accessToken;
  const [snapshot, setSnapshot] = useState<{ userId: string; count: number }>();
  useEffect(() => {
    let active = true,
      revision = 0,
      busy = false,
      queued = false;
    setSnapshot(undefined);
    if (!userId || !accessToken || !deviceId) return;
    let channel: BroadcastChannel | undefined;
    try {
      if (typeof BroadcastChannel !== 'undefined')
        channel = new BroadcastChannel('auction-ng-watchlist:' + userId);
    } catch {
      /* Counts still refresh locally when tab messaging is unavailable. */
    }
    const refresh = async () => {
      if (!active || document.visibilityState === 'hidden' || !navigator.onLine)
        return;
      const version = ++revision;
      if (busy) {
        queued = true;
        return;
      }
      busy = true;
      try {
        const { createWatchStatusClient } =
          await import('@auction-ng/api-client/watch-status');
        const value = await createWatchStatusClient(apiUrl, {
          accessToken,
          deviceId,
        }).count();
        if (active && version === revision)
          setSnapshot({ userId, count: value.count });
      } catch {
        if (active && version === revision) setSnapshot(undefined);
      } finally {
        busy = false;
        if (active && queued) {
          queued = false;
          void refresh();
        }
      }
    };
    const changed = (event: Event) => {
      const detail: unknown = (event as CustomEvent<unknown>).detail;
      if (
        !detail ||
        typeof detail !== 'object' ||
        !('userId' in detail) ||
        detail.userId !== userId
      )
        return;
      void refresh();
      channel?.postMessage({ type: 'changed' });
    };
    const visible = () => {
      void refresh();
    };
    const offline = () => {
      revision++;
      setSnapshot(undefined);
    };
    if (channel)
      channel.onmessage = (event: MessageEvent<unknown>) => {
        const data = event.data;
        if (
          data &&
          typeof data === 'object' &&
          'type' in data &&
          data.type === 'changed'
        )
          void refresh();
      };
    void refresh();
    const interval = window.setInterval(visible, 15000);
    window.addEventListener('auction-ng-watchlist-change', changed);
    window.addEventListener('focus', visible);
    window.addEventListener('online', visible);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      revision++;
      channel?.close();
      window.clearInterval(interval);
      window.removeEventListener('auction-ng-watchlist-change', changed);
      window.removeEventListener('focus', visible);
      window.removeEventListener('online', visible);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [userId, accessToken, deviceId]);
  return userId && snapshot?.userId === userId ? snapshot.count : undefined;
}
