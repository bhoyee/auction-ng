'use client';
import { useEffect, useRef, useState } from 'react';
import { createStaffAuthClient } from '@auction-ng/api-client/staff-auth';
import { ApiError } from '@auction-ng/api-client/auth';
import { staffSessionRules } from '@auction-ng/shared';
import { StaffIdleWarning } from '@auction-ng/ui/web/staff-idle-warning';

export function StaffInactivity({
  apiUrl,
  accessToken,
  deviceId,
  onExpired,
  onSignOut,
}: {
  apiUrl: string;
  accessToken: string;
  deviceId: string;
  onExpired(): void;
  onSignOut(): void;
}) {
  const deadline = useRef(Date.now() + staffSessionRules.idleMs);
  const absolute = useRef(Infinity);
  const [seconds, setSeconds] = useState(staffSessionRules.idleMs / 1000);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const callbacks = useRef({ onExpired, onSignOut });
  callbacks.current = { onExpired, onSignOut };
  const stay = useRef<() => void>(() => {});
  useEffect(() => {
    let alive = true,
      pending = false,
      queuedActivity = false,
      lastSent = -Infinity,
      ended = false;
    const client = createStaffAuthClient(apiUrl, deviceId);
    const expire = () => {
      if (ended || !alive) return;
      ended = true;
      callbacks.current.onExpired();
    };
    const remaining = () =>
      Math.min(deadline.current, absolute.current) - Date.now();
    const sync = async (activity = false): Promise<void> => {
      if (ended || !alive) return;
      if (pending) {
        queuedActivity ||= activity;
        return;
      }
      if (remaining() <= 0) {
        expire();
        return;
      }
      pending = true;
      if (activity) setBusy(true);
      const sentAt = Date.now();
      try {
        const state = await client.session(accessToken, activity);
        if (!alive || ended) return;
        const serverTime = Date.parse(state.serverTime);
        deadline.current =
          sentAt + Date.parse(state.idleExpiresAt) - serverTime;
        absolute.current = sentAt + Date.parse(state.expiresAt) - serverTime;
        setError('');
        setSeconds(Math.max(0, Math.ceil(remaining() / 1000)));
        if (remaining() <= 0) expire();
      } catch (cause) {
        if (!alive || ended) return;
        if (cause instanceof ApiError && [401, 403].includes(cause.status)) {
          // Token rotation is owned by StaffWorkspace. A stale access token
          // must get one verified renewal attempt, never reset the idle clock.
          window.dispatchEvent(new Event('giddydeal:staff-unauthorized'));
        }
        if (activity)
          setError(
            'We could not keep you signed in. Check your connection and try again before the timer ends.',
          );
      } finally {
        pending = false;
        if (alive) setBusy(false);
        if (alive && queuedActivity) {
          queuedActivity = false;
          void sync(true);
        }
      }
    };
    stay.current = () => {
      void sync(true);
    };
    const activity = (event: Event) => {
      if (
        !event.isTrusted ||
        document.hidden ||
        remaining() <= staffSessionRules.warningMs
      )
        return;
      const now = Date.now();
      if (now - lastSent < staffSessionRules.activityIntervalMs) return;
      lastSent = now;
      void sync(true);
    };
    const tick = () => {
      const left = remaining();
      setSeconds(Math.max(0, Math.ceil(left / 1000)));
      if (left <= 0) expire();
    };
    const visible = () => {
      tick();
      if (!document.hidden) void sync();
    };
    const events = [
      'pointerdown',
      'pointermove',
      'keydown',
      'wheel',
      'touchstart',
    ];
    for (const event of events)
      window.addEventListener(event, activity, { passive: true });
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    const timer = setInterval(tick, 1000);
    const poll = setInterval(() => {
      if (!document.hidden) void sync();
    }, staffSessionRules.checkIntervalMs);
    void sync();
    return () => {
      alive = false;
      clearInterval(timer);
      clearInterval(poll);
      for (const event of events) window.removeEventListener(event, activity);
      window.removeEventListener('focus', visible);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [apiUrl, accessToken, deviceId]);
  return (
    <StaffIdleWarning
      open={seconds <= staffSessionRules.warningMs / 1000}
      seconds={seconds}
      busy={busy}
      error={error}
      onDismissError={() => setError('')}
      canContinue={absolute.current - Date.now() > staffSessionRules.warningMs}
      onStay={() => stay.current()}
      onSignOut={() => callbacks.current.onSignOut()}
    />
  );
}
