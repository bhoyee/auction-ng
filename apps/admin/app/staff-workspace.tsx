'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createStaffAuthClient } from '@auction-ng/api-client/staff-auth';
import { createTwoFactorClient } from '@auction-ng/api-client/two-factor';
import { createStaffAdminClient } from '@auction-ng/api-client/staff-admin';
import { ApiError } from '@auction-ng/api-client/auth';
import { type TokenResponse, webRefreshSchema } from '@auction-ng/shared';
import { StaffSignIn } from '@auction-ng/ui/web/staff-sign-in';
import { BrandLogo } from '@auction-ng/ui/web/brand-logo';
import { Gavel, Package, ScanLine } from '@auction-ng/ui/web/icons';
import { TwoFactorSettings } from '@auction-ng/ui/web/two-factor-settings';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { StaffMessage } from '@auction-ng/ui/web/staff-dashboard-view';
import { StaffRecovery } from './staff-recovery';
import { AdminDashboard } from './admin-dashboard';
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
// How often an open admin page confirms the staff session is still valid.
const SESSION_CHECK_MS = 30_000;
// Tells other open admin tabs that this browser's staff session ended.
const SESSION_CHANNEL = 'lotvanta-staff-session';
const announce = (kind: 'ended') => {
  try {
    const channel = new BroadcastChannel(SESSION_CHANNEL);
    channel.postMessage(kind);
    channel.close();
  } catch {
    // Older browsers: each tab still finds out on its next check.
  }
};
// Renewal tokens are single use: a second renewal with the same token is
// treated as theft and ends the session. React runs start-up effects twice
// in development, so share one start-up renewal between them.
let startup:
  { at: number; device: string; promise: Promise<TokenResponse> } | undefined;
function startupRefresh(device: string) {
  if (startup && startup.device === device && Date.now() - startup.at < 15_000)
    return startup.promise;
  const promise = createStaffAuthClient(apiUrl, device).refresh();
  startup = { at: Date.now(), device, promise };
  return promise;
}

export function StaffWorkspace() {
  const [device, setDevice] = useState(''),
    [session, setSession] = useState<TokenResponse | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(true),
    [security, setSecurity] = useState(false);
  const [requiresCode, setRequiresCode] = useState(false);
  const generation = useRef(0);
  const currentSession = useRef(session);
  currentSession.current = session;
  const renewing = useRef<
    | {
        token: string;
        failClosed: boolean;
        promise: Promise<void>;
      }
    | undefined
  >(undefined);
  const expire = useCallback((token: string) => {
    if (currentSession.current?.accessToken !== token) return;
    generation.current++;
    currentSession.current = null;
    setSession(null);
    setSecurity(false);
    setRequiresCode(false);
    setBusy(false);
    setError('Your staff session expired. Sign in again.');
    window.history.replaceState(null, '', '/');
    announce('ended');
  }, []);
  const renew = useCallback(
    (token: string, failClosed = false) => {
      if (currentSession.current?.accessToken !== token)
        return Promise.resolve();
      if (renewing.current?.token === token) {
        renewing.current.failClosed ||= failClosed;
        return renewing.current.promise;
      }
      const version = generation.current;
      const owner = currentSession.current.user.id;
      const request = { token, failClosed, promise: Promise.resolve() };
      renewing.current = request;
      request.promise = createStaffAuthClient(apiUrl, device)
        .refresh()
        .then((value) => {
          if (
            version !== generation.current ||
            currentSession.current?.accessToken !== token
          )
            return;
          if (value.user.id !== owner) {
            expire(token);
            return;
          }
          currentSession.current = value;
          setSession(value);
          setError('');
        })
        .catch((cause: unknown) => {
          if (
            version !== generation.current ||
            currentSession.current?.accessToken !== token
          )
            return;
          if (
            request.failClosed ||
            (cause instanceof ApiError && [401, 403].includes(cause.status))
          )
            expire(token);
          else
            setError(
              'Your staff session could not be renewed. Check your connection; we will retry.',
            );
        })
        .finally(() => {
          if (renewing.current === request) renewing.current = undefined;
        });
      return request.promise;
    },
    [device, expire],
  );
  useEffect(() => {
    let active = true;
    let id = crypto.randomUUID() as string;
    try {
      const stored = localStorage.getItem('auction-ng-staff-device');
      if (
        stored &&
        webRefreshSchema.safeParse({ client: 'web', deviceId: stored }).success
      )
        id = stored;
      localStorage.setItem('auction-ng-staff-device', id);
    } catch {
      // Keep a temporary in-memory device identity when storage is unavailable.
    }
    setDevice(id);
    void startupRefresh(id)
      .then((s) => {
        if (active) setSession(s);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setReady(true);
      });
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      active = false;
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    if (!session || !device) return;
    const token = session.accessToken;
    const expiresAt = Date.now() + session.expiresInSeconds * 1000;
    const check = () => {
      // Past expiry (e.g. after sleep): renew if the session still allows
      // it, otherwise go straight to sign-in.
      if (Date.now() >= expiresAt) void renew(token, true);
      else if (Date.now() >= expiresAt - 60000) void renew(token);
    };
    const timer = setTimeout(
      check,
      Math.max(1000, (session.expiresInSeconds - 60) * 1000),
    );
    const deadline = setTimeout(check, session.expiresInSeconds * 1000);
    const retry = setInterval(check, 10000);
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearTimeout(timer);
      clearTimeout(deadline);
      clearInterval(retry);
      window.removeEventListener('focus', check);
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', check);
    };
    // A profile-only update must not postpone renewal of the existing token.
  }, [session?.accessToken, session?.expiresInSeconds, device, expire, renew]);
  // Session watchdog: an ended or revoked session (expiry, password change,
  // sign-out elsewhere, removed access) sends the page to sign-in by itself,
  // without waiting for the person to click or reload.
  const verify = useCallback(async () => {
    const current = currentSession.current;
    if (!current || !device || !navigator.onLine || document.hidden) return;
    try {
      await createStaffAdminClient(apiUrl, {
        accessToken: current.accessToken,
        deviceId: device,
      }).me();
    } catch (cause) {
      // Only a confirmed "not signed in" ends the session; network errors
      // keep the page and retry.
      if (cause instanceof ApiError && cause.status === 401)
        await renew(current.accessToken, true);
    }
  }, [device, renew]);
  useEffect(() => {
    if (!session?.accessToken || !device) return;
    const check = () => void verify();
    const timer = setInterval(check, SESSION_CHECK_MS);
    const visible = () => {
      if (!document.hidden) check();
    };
    // pageshow covers pages restored by the Back button.
    for (const event of ['focus', 'online', 'pageshow'])
      window.addEventListener(event, check);
    window.addEventListener('lotvanta:staff-unauthorized', check);
    document.addEventListener('visibilitychange', visible);
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel(SESSION_CHANNEL);
      channel.onmessage = check;
    } catch {
      channel = undefined;
    }
    return () => {
      clearInterval(timer);
      for (const event of ['focus', 'online', 'pageshow'])
        window.removeEventListener(event, check);
      window.removeEventListener('lotvanta:staff-unauthorized', check);
      document.removeEventListener('visibilitychange', visible);
      channel?.close();
    };
  }, [session?.accessToken, device, verify]);
  async function signOut() {
    try {
      await createStaffAuthClient(apiUrl, device).logout();
      generation.current++;
      setSession(null);
      announce('ended');
      setRequiresCode(false);
      setSecurity(false);
      setError('');
    } catch {
      setError('Sign out could not be confirmed. Reconnect and retry.');
    }
  }
  if (!ready)
    return (
      // A neutral screen while the session is confirmed, so a refresh never
      // flashes the sign-in page for someone who is already signed in.
      <main
        className="lv-staff-boot"
        role="status"
        aria-label="Opening the staff workspace"
      >
        <BrandLogo />
        <span className="lv-staff-boot-spinner" aria-hidden="true" />
      </main>
    );
  if (!session)
    return (
      <main className="lv-staff-login">
        <StaffLoginBrand />
        <div className="lv-staff-login-panel">
          <StaffSignIn
            requiresCode={requiresCode}
            onIdentityChange={() => {
              setRequiresCode(false);
              setError('');
            }}
            busy={busy}
            disabled={!online || !device}
            error={error}
            onSignIn={async (email, password, code) => {
              setBusy(true);
              setError('');
              try {
                const value = await createStaffAuthClient(
                  apiUrl,
                  device,
                ).signIn(email, password, code);
                generation.current++;
                setSession(value);
              } catch (cause) {
                if (
                  cause instanceof ApiError &&
                  ['TWO_FACTOR_REQUIRED', 'TWO_FACTOR_INVALID'].includes(
                    cause.code ?? '',
                  )
                ) {
                  setRequiresCode(true);
                  setError(
                    cause.code === 'TWO_FACTOR_INVALID'
                      ? 'Check your authenticator code and try again.'
                      : '',
                  );
                  return;
                }
                setError(
                  cause instanceof ApiError && cause.status === 429
                    ? 'Too many attempts. Wait 15 minutes before trying again.'
                    : 'Check your staff email and password.',
                );
              } finally {
                setBusy(false);
              }
            }}
          />
          <StaffRecovery
            baseUrl={apiUrl}
            deviceId={device}
            onSession={setSession}
          />
        </div>
      </main>
    );
  return (
    <>
      {error && <StaffMessage>{error}</StaffMessage>}
      <AdminDashboard
        key={session.user.id}
        apiUrl={apiUrl}
        session={session}
        deviceId={device}
        online={online}
        onSession={setSession}
        onUnauthorized={(token) => {
          void renew(token, true);
        }}
        onSignOut={() => void signOut()}
        onSecurity={() => setSecurity(true)}
      />
      <Dialog
        open={security}
        title="Account security"
        onClose={() => setSecurity(false)}
      >
        <TwoFactorSettings
          client={createTwoFactorClient(apiUrl, {
            accessToken: session.accessToken,
            deviceId: device,
          })}
        />
      </Dialog>
    </>
  );
}

/** Left panel of the staff sign-in page: brand and what the portal is for. */
function StaffLoginBrand() {
  return (
    <aside className="lv-staff-login-brand" aria-label="LotVanta staff portal">
      <div className="lv-staff-login-logo">
        <BrandLogo />
      </div>
      <div>
        <h2>Run every auction from one place.</h2>
        <ul>
          <li>
            <Gavel size={20} aria-hidden="true" /> Live auctions, bids and
            unsold relists
          </li>
          <li>
            <Package size={20} aria-hidden="true" /> Lots, intake, bins and
            labels
          </li>
          <li>
            <ScanLine size={20} aria-hidden="true" /> Pickup desk, invoices and
            payouts
          </li>
        </ul>
      </div>
      <p>Times are shown in WAT. Every staff action is recorded.</p>
    </aside>
  );
}
