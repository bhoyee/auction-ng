'use client';
import { useEffect, useRef, useState } from 'react';
import type { createAuthClient } from '@auction-ng/api-client/auth';
import { ApiError } from '@auction-ng/api-client/auth';
import {
  createBuyerInactivity,
  type BuyerInactivityState,
} from '@auction-ng/api-client/session-inactivity';
import { buyerSessionRules } from '@auction-ng/shared/buyer-session';
import type { TokenResponse } from '@auction-ng/shared/auth-session-schemas';
type Warning =
  typeof import('@auction-ng/ui/web/buyer-idle-warning').BuyerIdleWarning;

export default function BuyerInactivity({
  tokens,
  auth,
  renew,
  onExpired,
}: {
  tokens: TokenResponse;
  auth: ReturnType<typeof createAuthClient>;
  renew(token?: string): Promise<TokenResponse | null>;
  onExpired(): void;
}) {
  const latest = useRef({ tokens, auth, renew, onExpired });
  latest.current = { tokens, auth, renew, onExpired };
  const monitor = useRef<ReturnType<typeof createBuyerInactivity> | undefined>(
    undefined,
  );
  const [state, setState] = useState<BuyerInactivityState>({
    seconds: buyerSessionRules.idleMs / 1000,
    busy: false,
    error: '',
    canContinue: true,
  });
  const [logoutError, setLogoutError] = useState('');
  const [Warning, setWarning] = useState<Warning | null>(null);
  const warningOpen = state.seconds <= buyerSessionRules.warningMs / 1000;
  useEffect(() => {
    if (!warningOpen) return;
    let active = true;
    void import('@auction-ng/ui/web/buyer-idle-warning').then((module) => {
      if (active) setWarning(() => module.BuyerIdleWarning);
    });
    return () => {
      active = false;
    };
  }, [warningOpen]);
  const owner = tokens.user.id;
  useEffect(() => {
    const channel =
      typeof BroadcastChannel === 'undefined'
        ? undefined
        : new BroadcastChannel('giddydeal:buyer-activity');
    const read = async (token: string, activity: boolean) => {
      const state = await latest.current.auth.session(token, activity);
      if (activity) channel?.postMessage(owner);
      return state;
    };
    const check = createBuyerInactivity({
      initialState: latest.current.tokens.sessionState,
      update: setState,
      expired: () => latest.current.onExpired(),
      read: async (activity) => {
        const current = latest.current;
        try {
          return await read(current.tokens.accessToken, activity);
        } catch (cause) {
          if (!(cause instanceof ApiError) || cause.status !== 401) throw cause;
          const fresh = await current.renew(current.tokens.accessToken);
          if (!fresh || fresh.user.id !== owner) throw new ApiError(401);
          return read(fresh.accessToken, activity);
        }
      },
    });
    monitor.current = check;
    if (channel)
      channel.onmessage = (event) => {
        if (event.data === owner) void check.sync();
      };
    const interaction = (event: Event) => {
      if (event.isTrusted && !document.hidden) void check.interact();
    };
    const visible = () => {
      check.tick();
      if (!document.hidden) void check.sync();
    };
    const events = [
      'pointerdown',
      'pointermove',
      'keydown',
      'wheel',
      'touchstart',
    ];
    for (const event of events)
      window.addEventListener(event, interaction, { passive: true });
    window.addEventListener('focus', visible);
    window.addEventListener('online', visible);
    document.addEventListener('visibilitychange', visible);
    const timer = setInterval(() => check.tick(), 1000);
    const poll = setInterval(() => {
      if (!document.hidden && navigator.onLine) void check.sync();
    }, buyerSessionRules.checkIntervalMs);
    void check.sync();
    return () => {
      check.dispose();
      channel?.close();
      clearInterval(timer);
      clearInterval(poll);
      for (const event of events)
        window.removeEventListener(event, interaction);
      window.removeEventListener('focus', visible);
      window.removeEventListener('online', visible);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [owner]);
  if (!warningOpen || !Warning) return null;
  return (
    <Warning
      {...state}
      open={state.seconds <= buyerSessionRules.warningMs / 1000}
      error={logoutError || state.error}
      onStay={() => {
        setLogoutError('');
        void monitor.current?.sync(true);
      }}
      onDismissError={() => {
        setLogoutError('');
        monitor.current?.dismissError();
      }}
      onSignOut={() => {
        void latest.current.auth
          .logout()
          .then(() => latest.current.onExpired())
          .catch(() =>
            setLogoutError(
              'We could not sign you out. Check your connection and retry.',
            ),
          );
      }}
    />
  );
}
