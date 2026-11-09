'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createStaffAuthClient } from '@auction-ng/api-client/staff-auth';
import { createTwoFactorClient } from '@auction-ng/api-client/two-factor';
import { ApiError } from '@auction-ng/api-client/auth';
import { type TokenResponse, webRefreshSchema } from '@auction-ng/shared';
import { StaffSignIn } from '@auction-ng/ui/web/staff-sign-in';
import { BrandLogo } from '@auction-ng/ui/web/brand-logo';
import { TwoFactorSettings } from '@auction-ng/ui/web/two-factor-settings';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { StaffMessage } from '@auction-ng/ui/web/staff-dashboard-view';
import { StaffRecovery } from './staff-recovery';
import { AdminDashboard } from './admin-dashboard';
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export function StaffWorkspace() {
  const [device, setDevice] = useState(''),
    [session, setSession] = useState<TokenResponse | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(true),
    [security, setSecurity] = useState(false);
  // Step 2 of sign-in. The password is kept in memory only to resend a code.
  const [challenge, setChallenge] = useState<{
    id: string;
    email: string;
    password: string;
    twoFactorRequired: boolean;
    resent: boolean;
  }>();
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
    setChallenge(undefined);
    setBusy(false);
    setError('Your staff session expired. Sign in again.');
    window.history.replaceState(null, '', '/');
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
    void createStaffAuthClient(apiUrl, id)
      .refresh()
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
      if (Date.now() >= expiresAt) expire(token);
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
  async function signOut() {
    try {
      await createStaffAuthClient(apiUrl, device).logout();
      generation.current++;
      setSession(null);
      setChallenge(undefined);
      setSecurity(false);
      setError('');
    } catch {
      setError('Sign out could not be confirmed. Reconnect and retry.');
    }
  }
  if (!ready)
    return (
      <main className="lv-staff-login" role="status">
        Checking your secure staff session…
      </main>
    );
  if (!session)
    return (
      <main className="lv-staff-login">
        <BrandLogo />
        <StaffSignIn
          challenge={challenge}
          onIdentityChange={() => setError('')}
          busy={busy}
          disabled={!online || !device}
          error={error}
          onSignIn={async (email, password) => {
            setBusy(true);
            setError('');
            try {
              const next = await createStaffAuthClient(apiUrl, device).signIn(
                email,
                password,
              );
              setChallenge({
                id: next.challengeId,
                email,
                password,
                twoFactorRequired: next.twoFactorRequired,
                resent: false,
              });
            } catch (cause) {
              setError(
                cause instanceof ApiError && cause.status === 429
                  ? 'Too many attempts. Wait 15 minutes before trying again.'
                  : cause instanceof ApiError && cause.status === 503
                    ? 'We can’t send email codes right now. Try again shortly or contact the operator.'
                    : 'Check your staff email and password.',
              );
            } finally {
              setBusy(false);
            }
          }}
          onResend={async () => {
            if (!challenge) return;
            setBusy(true);
            setError('');
            try {
              const next = await createStaffAuthClient(apiUrl, device).signIn(
                challenge.email,
                challenge.password,
              );
              setChallenge({
                ...challenge,
                id: next.challengeId,
                twoFactorRequired: next.twoFactorRequired,
                resent: true,
              });
            } catch (cause) {
              setError(
                cause instanceof ApiError && cause.status === 429
                  ? 'Too many attempts. Wait 15 minutes before trying again.'
                  : 'A new code could not be sent. Go back and sign in again.',
              );
            } finally {
              setBusy(false);
            }
          }}
          onBack={() => {
            setChallenge(undefined);
            setError('');
          }}
          onVerify={async (code, authenticatorCode) => {
            if (!challenge) return;
            setBusy(true);
            setError('');
            try {
              const value = await createStaffAuthClient(
                apiUrl,
                device,
              ).verifySignIn(challenge.id, code, authenticatorCode);
              generation.current++;
              setChallenge(undefined);
              setSession(value);
            } catch (cause) {
              if (cause instanceof ApiError && cause.code) {
                if (cause.code === 'TWO_FACTOR_REQUIRED')
                  setChallenge({ ...challenge, twoFactorRequired: true });
                setError(
                  cause.code === 'TWO_FACTOR_INVALID'
                    ? 'Check your authenticator code and try again.'
                    : 'Enter your authenticator code.',
                );
                return;
              }
              setError(
                cause instanceof ApiError && cause.status === 429
                  ? 'Too many attempts. Wait 15 minutes before trying again.'
                  : 'Check the six-digit code from your email, or send a new code.',
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
