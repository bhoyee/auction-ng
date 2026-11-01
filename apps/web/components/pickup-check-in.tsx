'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPickupVisitClient } from '@auction-ng/api-client/pickup-visits';
import { ApiError } from '@auction-ng/api-client/auth';
import type { PickupVisitPass } from '@auction-ng/shared/pickup-visit-schemas';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { BuyerSkeleton, BuyerLink } from '@auction-ng/ui/web/buyer';
import { PickupPassCard } from '@auction-ng/ui/web/pickup-visit';
import { Button } from '@auction-ng/ui/web/button';
import {
  WalletNotice,
  WalletPagination,
} from '@auction-ng/ui/web/wallet-workspace';
import { EmptyState } from '@auction-ng/ui/web/empty-state';
import { useWalletRead } from '../lib/wallet-read';
import { apiUrl, useBuyer } from '../lib/session';

type Snapshot = { owner: string; locationId: string; pass: PickupVisitPass };
export function PickupCheckIn() {
  const session = useBuyer(),
    owner = session.tokens?.user.id;
  const [pages, setPages] = useState<(string | undefined)[]>([undefined]),
    [locationId, setLocationId] = useState<string>(),
    [snapshot, setSnapshot] = useState<Snapshot>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [image, setImage] = useState<string>(),
    [clock, setClock] = useState(Date.now());
  const cursor = pages.at(-1),
    saved = useRef<Snapshot | undefined>(undefined),
    generation = useRef(0),
    identity = useRef({ owner, locationId });
  identity.current = { owner, locationId };
  const readCentres = useCallback(
    (credentials: { accessToken: string; deviceId: string }) =>
      createPickupVisitClient(apiUrl, credentials).centres({
        limit: 10,
        cursor,
      }),
    [cursor],
  );
  const centres = useWalletRead(readCentres);
  const pass =
    snapshot && snapshot.owner === owner && snapshot.locationId === locationId
      ? snapshot.pass
      : undefined;
  useEffect(() => {
    if (!locationId && centres.data?.items[0])
      setLocationId(centres.data.items[0].id);
  }, [locationId, centres.data]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const withAuth = useCallback(
    async <T,>(
      run: (client: ReturnType<typeof createPickupVisitClient>) => Promise<T>,
    ) => {
      if (!session.tokens) throw new Error('Sign in again.');
      const client = (token: string) =>
        createPickupVisitClient(apiUrl, {
          accessToken: token,
          deviceId: session.deviceId,
        });
      try {
        return await run(client(session.tokens.accessToken));
      } catch (cause) {
        if (!(cause instanceof ApiError) || cause.status !== 401) throw cause;
        const fresh = await session.renewSession(session.tokens.accessToken);
        if (!fresh || fresh.user.id !== owner) throw cause;
        return run(client(fresh.accessToken));
      }
    },
    [session.tokens, session.deviceId, session.renewSession, owner],
  );
  useEffect(() => {
    if (!owner || !locationId) return;
    let active = true,
      running = false;
    setError('');
    generation.current++;
    const read = async () => {
      if (running || document.hidden) return;
      if (!navigator.onLine) {
        if (active)
          setError(
            'Your pass could not be refreshed. Reconnect before showing it to staff.',
          );
        return;
      }
      running = true;
      const version = generation.current;
      try {
        const current = saved.current,
          value = await withAuth((client) =>
            current?.owner === owner && current.locationId === locationId
              ? client.pass(current.pass.id)
              : client.prepare(locationId),
          );
        if (active && version === generation.current) {
          const next = { owner, locationId, pass: value };
          saved.current = next;
          setSnapshot(next);
          setError('');
        }
      } catch {
        if (active && version === generation.current)
          setError(
            'Your check-in pass could not be loaded. Check your connection and retry.',
          );
      } finally {
        running = false;
      }
    };
    void read();
    const timer = setInterval(() => void read(), 15000);
    window.addEventListener('focus', read);
    window.addEventListener('online', read);
    window.addEventListener('offline', read);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', read);
      window.removeEventListener('online', read);
      window.removeEventListener('offline', read);
    };
  }, [owner, locationId, withAuth]);
  useEffect(() => {
    let active = true;
    setImage(undefined);
    if (pass && !pass.visit)
      void import('qrcode')
        .then((qr) =>
          qr.toDataURL(pass.token, {
            width: 480,
            margin: 2,
            errorCorrectionLevel: 'M',
          }),
        )
        .then((value) => {
          if (active) setImage(value);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [pass?.token, pass?.visit?.id]);
  const renew = async (replace = false) => {
    if (!owner || !locationId || busy) return;
    setBusy(true);
    setError('');
    const version = ++generation.current;
    try {
      const value = await withAuth((client) =>
        !replace &&
        saved.current?.owner === owner &&
        saved.current.locationId === locationId
          ? client.pass(saved.current.pass.id)
          : client.prepare(locationId, replace),
      );
      if (
        identity.current.owner !== owner ||
        identity.current.locationId !== locationId ||
        version !== generation.current
      )
        return;
      const next = { owner, locationId, pass: value };
      saved.current = next;
      setSnapshot(next);
    } catch {
      if (identity.current.owner === owner)
        setError(
          'A fresh pass could not be prepared. Reconnect and try again.',
        );
    } finally {
      if (identity.current.owner === owner) setBusy(false);
    }
  };
  // Expiry remains server-enforced; calculate a local display deadline when a snapshot arrives.
  const [deadline, setDeadline] = useState<number>();
  useEffect(() => {
    if (pass)
      setDeadline(
        Date.now() + Date.parse(pass.expiresAt) - Date.parse(pass.serverTime),
      );
  }, [pass?.serverTime, pass?.expiresAt]);
  const isExpired =
    deadline !== undefined
      ? clock >= deadline
      : !!pass && clock >= Date.parse(pass.expiresAt);
  return (
    <BuyerPage
      title="Check-in"
      description="One pass for your visit. Show it to staff when you arrive."
    >
      {centres.error && (
        <WalletNotice onRetry={centres.reload}>
          Collection centres could not be refreshed. Check your connection and
          retry.
        </WalletNotice>
      )}
      {!centres.data ? (
        centres.error ? null : (
          <BuyerSkeleton />
        )
      ) : !locationId && !centres.data?.items.length ? (
        <EmptyState
          title="Nothing awaiting pickup"
          action={<BuyerLink href="/">Browse auctions</BuyerLink>}
        >
          Your check-in pass will appear when you have paid items to collect.
        </EmptyState>
      ) : (
        <>
          {centres.data &&
            (centres.data.items.length > 1 ||
              pages.length > 1 ||
              centres.data.nextCursor) && (
              <div className="agn-visit-centres">
                <div className="agn-field">
                  <label htmlFor="pickup-centre">Collection centre</label>
                  <select
                    id="pickup-centre"
                    className="agn-input"
                    value={locationId ?? ''}
                    onChange={(event) => setLocationId(event.target.value)}
                  >
                    {centres.data.items.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <WalletPagination
                  page={pages.length}
                  size={10}
                  hasNext={!!centres.data.nextCursor}
                  onPrevious={() => {
                    setLocationId(undefined);
                    setPages((p) => (p.length > 1 ? p.slice(0, -1) : p));
                  }}
                  onNext={() => {
                    if (centres.data?.nextCursor) {
                      setLocationId(undefined);
                      setPages((p) => [
                        ...p,
                        centres.data?.nextCursor ?? undefined,
                      ]);
                    }
                  }}
                />
              </div>
            )}
          {error ? (
            <WalletNotice onRetry={() => void renew()}>{error}</WalletNotice>
          ) : pass ? (
            <PickupPassCard pass={pass} image={image} expired={isExpired}>
              {!pass.visit && isExpired && (
                <Button busy={busy} onClick={() => void renew(true)}>
                  Refresh pass
                </Button>
              )}
              {pass.visit &&
                pass.visit.status !== 'waiting' &&
                centres.data.items.some(
                  (c) => c.id === locationId && c.orderCount > 0,
                ) && (
                  <Button busy={busy} onClick={() => void renew(true)}>
                    Prepare another visit pass
                  </Button>
                )}
            </PickupPassCard>
          ) : (
            <BuyerSkeleton />
          )}
        </>
      )}
    </BuyerPage>
  );
}
