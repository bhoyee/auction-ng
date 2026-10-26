'use client';
import { useEffect, useState } from 'react';
import { apiUrl } from './session';
let clock: { offset: number; measuredAt: number } | undefined;
let pending: Promise<void> | undefined;
async function refresh() {
  if (clock && Date.now() - clock.measuredAt < 60000) return;
  pending ??= (async () => {
    const { readServerTime } = await import('@auction-ng/api-client/clock');
    const started = Date.now();
    const result = await readServerTime(apiUrl);
    const received = Date.now();
    clock = {
      offset:
        Date.parse(result.serverTime) + (received - started) / 2 - received,
      measuredAt: received,
    };
  })().finally(() => {
    pending = undefined;
  });
  return pending;
}
export function useServerClock(enabled = true) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setNow(0);
      return;
    }
    let active = true;
    const update = () => {
      void refresh()
        .then(() => {
          if (active && clock) setNow(Date.now() + clock.offset);
        })
        .catch(() => {
          if (active) setNow(0);
        });
    };
    update();
    const timer = setInterval(update, 1000);
    window.addEventListener('focus', update);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, [enabled]);
  return now;
}
