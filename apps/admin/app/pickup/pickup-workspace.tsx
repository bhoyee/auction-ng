'use client';
import { useEffect, useState } from 'react';
import {
  ScanLine,
  LogOut,
  Download,
  ShieldCheck,
} from '@auction-ng/ui/web/icons';
import { createStaffAdminClient } from '@auction-ng/api-client/staff-admin';
import { ApiError } from '@auction-ng/api-client/auth';
import type { TokenResponse } from '@auction-ng/shared';
import type { PickupVisit } from '@auction-ng/shared/pickup-visit-schemas';
import { BrandLogo } from '@auction-ng/ui/web/brand-logo';
import { Button } from '@auction-ng/ui/web/button';
import { ActivePickupDesk } from '../pickup-arrivals';
import { CheckInBuyer } from '../check-in-buyer';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
export function PickupWorkspace({
  session,
  deviceId,
  online,
  onSignOut,
}: {
  session: TokenResponse;
  deviceId: string;
  online: boolean;
  onSignOut: () => void;
}) {
  const [access, setAccess] = useState<
    'loading' | 'allowed' | 'denied' | 'error'
  >('loading');
  const [revision, setRevision] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [arrival, setArrival] = useState<PickupVisit>();
  const [install, setInstall] = useState<InstallPrompt>();
  const [installHelp, setInstallHelp] = useState(false);
  useEffect(() => {
    // Installation never saves a staff session or protected response offline.
    if ('serviceWorker' in navigator && window.isSecureContext)
      void navigator.serviceWorker
        .register('/pickup/sw.js', { scope: '/pickup/' })
        .catch(() => {});
    const prompt = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallPrompt);
    };
    const installed = () => {
      setInstall(undefined);
      setInstallHelp(false);
    };
    window.addEventListener('beforeinstallprompt', prompt);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', prompt);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  useEffect(() => {
    let active = true,
      running = false;
    setAccess('loading');
    const read = async () => {
      if (running || document.hidden) return;
      running = true;
      try {
        const value = await createStaffAdminClient(apiUrl, {
          accessToken: session.accessToken,
          deviceId,
        }).me();
        if (active)
          setAccess(
            value.permissions.includes('pickup.manage') ? 'allowed' : 'denied',
          );
      } catch (cause) {
        if (!active) return;
        setAccess(
          cause instanceof ApiError && [401, 403].includes(cause.status)
            ? 'denied'
            : 'error',
        );
        if (cause instanceof ApiError && cause.status === 401)
          window.dispatchEvent(new Event('giddydeal:staff-unauthorized'));
      } finally {
        running = false;
      }
    };
    void read();
    const timer = setInterval(() => void read(), 15000);
    window.addEventListener('online', read);
    window.addEventListener('focus', read);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('online', read);
      window.removeEventListener('focus', read);
    };
  }, [session.accessToken, deviceId, revision]);
  return (
    <main className="lv-pickup-app">
      <header className="lv-pickup-app-header">
        <div>
          <BrandLogo />
          <p>Pickup desk</p>
        </div>
        <Button variant="danger" size="small" onClick={onSignOut}>
          <LogOut size={18} aria-hidden="true" />
          Sign out
        </Button>
      </header>
      <section className="lv-pickup-app-intro">
        <p className="lv-pickup-app-security">
          <ShieldCheck size={16} aria-hidden="true" />
          Staff access · {online ? 'Connected' : 'Offline'}
        </p>
        <h1>Ready for collection.</h1>
        <p>Check in the buyer, verify their items, then confirm handover.</p>
        <Button
          size="large"
          disabled={access !== 'allowed' || !online}
          onClick={() => setScanning(true)}
        >
          <ScanLine size={22} aria-hidden="true" />
          Scan or enter buyer pass
        </Button>
        <Button
          variant="secondary"
          onClick={async () => {
            if (install) {
              await install.prompt();
              await install.userChoice;
              setInstall(undefined);
            } else setInstallHelp(!installHelp);
          }}
        >
          <Download size={18} aria-hidden="true" />
          Add to home screen
        </Button>
        {installHelp && (
          <p role="status">
            Open this page over HTTPS. On Android, use Chrome’s menu → Install
            app or Add to Home screen. On iPhone, use Safari → Share → Add to
            Home Screen.
          </p>
        )}
      </section>
      {!online && (
        <p className="agn-field-error" role="alert">
          Reconnect before checking in or handing over items.
        </p>
      )}
      {access === 'loading' && <p role="status">Checking pickup access…</p>}
      {access === 'denied' && (
        <p role="alert">
          This account does not have pickup access. Ask an administrator to
          assign it.
        </p>
      )}
      {access === 'error' && (
        <div role="alert">
          <p>
            Pickup access could not be checked. Check your connection and try
            again.
          </p>
          <Button onClick={() => setRevision((v) => v + 1)}>Try again</Button>
        </div>
      )}
      {access === 'allowed' && (
        <ActivePickupDesk
          accessToken={session.accessToken}
          deviceId={deviceId}
          online={online}
          arrival={arrival}
        />
      )}
      {scanning && access === 'allowed' && (
        <CheckInBuyer
          accessToken={session.accessToken}
          deviceId={deviceId}
          online={online}
          onClose={() => setScanning(false)}
          onRegistered={(visit) => {
            setArrival(visit);
            setScanning(false);
          }}
        />
      )}
      <footer>GiddyDeal Pickup · Collection actions are recorded.</footer>
    </main>
  );
}
