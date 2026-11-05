'use client';
import { useEffect, useRef, useState } from 'react';
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
  const [requiresCode, setRequiresCode] = useState(false);
  const generation = useRef(0);
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
    let active = true;
    const version = generation.current;
    const timer = setTimeout(
      () => {
        void createStaffAuthClient(apiUrl, device)
          .refresh()
          .then((value) => {
            if (active && version === generation.current) setSession(value);
          })
          .catch(() => {
            if (active && version === generation.current) {
              setSession(null);
              setError('Your staff session expired. Sign in again.');
            }
          });
      },
      Math.max(1000, (session.expiresInSeconds - 60) * 1000),
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [session, device]);
  async function signOut() {
    try {
      await createStaffAuthClient(apiUrl, device).logout();
      generation.current++;
      setSession(null);
      setRequiresCode(false);
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
              const value = await createStaffAuthClient(apiUrl, device).signIn(
                email,
                password,
                code,
              );
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
