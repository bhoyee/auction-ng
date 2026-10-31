'use client';
import { useEffect, useState } from 'react';
import { createArrivalClient } from '@auction-ng/api-client/pickup-arrivals';
import type { PickupArrival } from '@auction-ng/shared/pickup-arrival-schemas';
import { ArrivalPanel, ArrivalRow } from '@auction-ng/ui/web/pickup-check-in';
import { Button } from '@auction-ng/ui/web/button';
import { Dialog } from '@auction-ng/ui/web/dialog';
import {
  WalletPagination,
  WalletNotice,
} from '@auction-ng/ui/web/wallet-workspace';
import { Toast } from '@auction-ng/ui/web/toast';
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export function PickupArrivals({
  accessToken,
  deviceId,
  online,
}: {
  accessToken: string;
  deviceId: string;
  online: boolean;
}) {
  const [pages, setPages] = useState<(string | undefined)[]>([undefined]),
    [data, setData] = useState<{
      items: PickupArrival[];
      nextCursor: string | null;
    }>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0),
    [closing, setClosing] = useState<PickupArrival>(),
    [message, setMessage] = useState('');
  const cursor = pages.at(-1);
  useEffect(() => setData(undefined), [cursor]);
  useEffect(() => {
    let active = true,
      running = false;
    const read = async () => {
      if (running || document.hidden) return;
      if (!navigator.onLine) {
        if (active)
          setError(
            'Arrival queue is offline. Reconnect before updating a visit.',
          );
        return;
      }
      running = true;
      try {
        const value = await createArrivalClient(apiUrl, {
          accessToken,
          deviceId,
        }).list(true, { limit: 10, cursor });
        if (active) {
          setData(value);
          setError('');
        }
      } catch {
        if (active)
          setError(
            'Arrival queue could not be refreshed. Retry before updating a visit.',
          );
      } finally {
        running = false;
      }
    };
    void read();
    const timer = setInterval(() => void read(), 15000);
    window.addEventListener('focus', read);
    window.addEventListener('online', read);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', read);
      window.removeEventListener('online', read);
    };
  }, [accessToken, deviceId, cursor, version]);
  const update = async (
    row: PickupArrival,
    status: 'acknowledged' | 'closed',
  ) => {
    if (busy || !online || error) return;
    setBusy(true);
    setMessage('');
    try {
      await createArrivalClient(apiUrl, { accessToken, deviceId }).update(
        row.id,
        { status, expectedStatus: row.status },
      );
      setClosing(undefined);
      setMessage(
        status === 'closed'
          ? 'Visit closed. This has not marked the order as collected.'
          : 'Arrival acknowledged.',
      );
      setVersion((v) => v + 1);
    } catch {
      setClosing(undefined);
      setError('The visit could not be updated. Refresh the queue and retry.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <ArrivalPanel title="Pickup arrivals">
      <p>
        Buyers who have confirmed arrival. Acknowledge them, then close the
        visit when finished. Closing a visit does not confirm collection or
        release goods.
      </p>
      {message && (
        <Toast tone="success" onClose={() => setMessage('')}>
          {message}
        </Toast>
      )}
      {error && (
        <WalletNotice onRetry={() => setVersion((v) => v + 1)}>
          {error}
        </WalletNotice>
      )}
      {!data ? (
        !error && <p role="status">Loading arrivals…</p>
      ) : data.items.length ? (
        data.items.map((row) => (
          <ArrivalRow key={row.id} arrival={row} staff>
            <Button
              disabled={busy || !online || !!error}
              onClick={() =>
                row.status === 'waiting'
                  ? void update(row, 'acknowledged')
                  : setClosing(row)
              }
            >
              {row.status === 'waiting' ? 'Acknowledge arrival' : 'Close visit'}
            </Button>
          </ArrivalRow>
        ))
      ) : (
        <p>No buyers are waiting on this page.</p>
      )}
      <WalletPagination
        page={pages.length}
        size={10}
        hasNext={!!data?.nextCursor}
        onPrevious={() => setPages((p) => (p.length > 1 ? p.slice(0, -1) : p))}
        onNext={() => {
          if (data?.nextCursor)
            setPages((p) => [...p, data?.nextCursor ?? undefined]);
        }}
      />
      <Dialog
        open={!!closing}
        title="Close arrival visit?"
        onClose={() => {
          if (!busy) setClosing(undefined);
        }}
      >
        <p>
          Close the visit for <strong>{closing?.buyerName}</strong>? This
          removes the arrival from the queue. It does not mark their order as
          collected.
        </p>
        <Button
          disabled={busy || !!error || !online}
          onClick={() => {
            if (closing) void update(closing, 'closed');
          }}
        >
          Close visit
        </Button>
      </Dialog>
    </ArrivalPanel>
  );
}
