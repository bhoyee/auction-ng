'use client';
import { useEffect, useState } from 'react';
import type { PublicLotResult } from '@auction-ng/shared';
import { apiUrl } from './session';
export function useLotResult(lotId: string) {
  const [snapshot, setSnapshot] = useState<PublicLotResult>();
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true,
      running = false,
      terminal = false;
    const refresh = async () => {
      if (terminal || running || document.hidden || !navigator.onLine) return;
      running = true;
      try {
        const { createCatalogueClient } =
          await import('@auction-ng/api-client');
        const value = await createCatalogueClient(apiUrl).result(lotId);
        if (active) {
          terminal = value.state === 'sold' || value.state === 'unsold';
          setSnapshot(value);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      } finally {
        running = false;
      }
    };
    void refresh();
    const listener = () => void refresh();
    const timer = setInterval(listener, 5000);
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
  }, [lotId, version]);
  return {
    result: snapshot?.lotId === lotId ? snapshot : undefined,
    error,
    reload: () => setVersion((value) => value + 1),
  };
}
