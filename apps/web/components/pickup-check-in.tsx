'use client';
import { useCallback, useRef, useState } from 'react';
import { createArrivalClient } from '@auction-ng/api-client/pickup-arrivals';
import { createBuyerClient } from '@auction-ng/api-client/buyers';
import { ApiError } from '@auction-ng/api-client/auth';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { BuyerSkeleton } from '@auction-ng/ui/web/buyer';
import {
  ArrivalPanel,
  ArrivalRow,
  ArrivalOrder,
} from '@auction-ng/ui/web/pickup-check-in';
import {
  WalletNotice,
  WalletPagination,
} from '@auction-ng/ui/web/wallet-workspace';
import { Button } from '@auction-ng/ui/web/button';
import { Toast } from '@auction-ng/ui/web/toast';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { useWalletRead } from '../lib/wallet-read';
import { apiUrl, useBuyer } from '../lib/session';
export function PickupCheckIn() {
  const session = useBuyer(),
    owner = session.tokens?.user.id;
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const [pages, setPages] = useState<(string | undefined)[]>([undefined]),
    [arrivalPages, setArrivalPages] = useState<(string | undefined)[]>([
      undefined,
    ]);
  const cursor = pages.at(-1),
    arrivalCursor = arrivalPages.at(-1);
  const readOrders = useCallback(
    (credentials: { accessToken: string; deviceId: string }) =>
      createBuyerClient(apiUrl, credentials).collections({ limit: 10, cursor }),
    [cursor],
  );
  const readArrivals = useCallback(
    (credentials: { accessToken: string; deviceId: string }) =>
      createArrivalClient(apiUrl, credentials).list(false, {
        limit: 10,
        cursor: arrivalCursor,
      }),
    [arrivalCursor],
  );
  const orders = useWalletRead(readOrders),
    arrivals = useWalletRead(readArrivals);
  const [target, setTarget] = useState<{
      id: string;
      number: string;
      key: string;
    }>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  const confirm = async () => {
    if (!target || !session.tokens || busy) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const run = (accessToken: string) =>
        createArrivalClient(apiUrl, {
          accessToken,
          deviceId: session.deviceId,
        }).checkIn({ invoiceId: target.id, idempotencyKey: target.key });
      let result;
      try {
        result = await run(session.tokens.accessToken);
      } catch (cause) {
        if (!(cause instanceof ApiError) || cause.status !== 401) throw cause;
        const fresh = await session.renewSession(session.tokens.accessToken);
        if (!fresh || fresh.user.id !== owner) throw cause;
        result = await run(fresh.accessToken);
      }
      if (currentOwner.current !== owner) return;
      setTarget(undefined);
      setSuccess(
        result.status === 'waiting' || result.status === 'acknowledged'
          ? 'You are checked in. Warehouse staff can see your arrival. Keep your pickup pass ready.'
          : 'This visit is already closed. Refresh before starting a new check-in.',
      );
      arrivals.reload();
      orders.reload();
    } catch (cause) {
      if (currentOwner.current !== owner) return;
      setError(
        cause instanceof ApiError && cause.status === 409
          ? 'This order has changed or is already checked in. Refresh your arrivals before trying again.'
          : cause instanceof ApiError && cause.status === 429
            ? 'Too many requests. Wait a moment before retrying.'
            : 'Check-in could not be confirmed. Check your connection and retry this same request.',
      );
      arrivals.reload();
      orders.reload();
    } finally {
      if (currentOwner.current === owner) setBusy(false);
    }
  };
  return (
    <BuyerPage
      title="Check-in"
      description="At the collection centre? Let warehouse staff know you have arrived."
    >
      {success && (
        <Toast tone="success" emphasis onClose={() => setSuccess('')}>
          {success}
        </Toast>
      )}
      {(orders.error || arrivals.error) && (
        <WalletNotice
          onRetry={() => {
            orders.reload();
            arrivals.reload();
          }}
        >
          Pickup information could not be refreshed. Check your connection and
          retry before checking in.
        </WalletNotice>
      )}
      <ArrivalPanel title="Your arrivals">
        {!arrivals.data ? (
          arrivals.error ? null : (
            <BuyerSkeleton />
          )
        ) : arrivals.data.items.length ? (
          arrivals.data.items.map((arrival) => (
            <ArrivalRow key={arrival.id} arrival={arrival}>
              <a
                className="agn-button agn-button--secondary"
                href={`/invoices/${arrival.invoiceId}/pickup-pass`}
              >
                Pickup pass
              </a>
            </ArrivalRow>
          ))
        ) : (
          <p>
            You have no active check-in. Choose an order below when you arrive.
          </p>
        )}
        <WalletPagination
          page={arrivalPages.length}
          size={10}
          hasNext={!!arrivals.data?.nextCursor}
          onPrevious={() =>
            setArrivalPages((p) => (p.length > 1 ? p.slice(0, -1) : p))
          }
          onNext={() => {
            if (arrivals.data?.nextCursor)
              setArrivalPages((p) => [
                ...p,
                arrivals.data?.nextCursor ?? undefined,
              ]);
          }}
        />
      </ArrivalPanel>
      <ArrivalPanel title="Choose a pickup order">
        <p>
          Check in only when you are at the collection centre. Check-in does not
          mark an order as collected.
        </p>
        {!orders.data ? (
          orders.error ? null : (
            <BuyerSkeleton />
          )
        ) : orders.data.items.length ? (
          orders.data.items.map((order) => {
            const checked = arrivals.data?.items.some(
              (a) => a.invoiceId === order.id,
            );
            return (
              <ArrivalOrder key={order.id} number={order.number}>
                <Button
                  disabled={
                    busy ||
                    checked ||
                    !arrivals.data ||
                    arrivals.error ||
                    orders.error
                  }
                  onClick={() => {
                    setError('');
                    setTarget({
                      id: order.id,
                      number: order.number,
                      key: crypto.randomUUID(),
                    });
                  }}
                >
                  {' '}
                  {checked ? 'Checked in' : 'Check in'}
                </Button>
              </ArrivalOrder>
            );
          })
        ) : (
          <p>No paid orders are awaiting pickup.</p>
        )}
        <WalletPagination
          page={pages.length}
          size={10}
          hasNext={!!orders.data?.nextCursor}
          onPrevious={() =>
            setPages((p) => (p.length > 1 ? p.slice(0, -1) : p))
          }
          onNext={() => {
            if (orders.data?.nextCursor)
              setPages((p) => [...p, orders.data?.nextCursor ?? undefined]);
          }}
        />
      </ArrivalPanel>
      <Dialog
        open={!!target}
        title="Confirm your arrival"
        onClose={() => {
          if (!busy) setTarget(undefined);
        }}
      >
        {error && (
          <Toast tone="error" emphasis onClose={() => setError('')}>
            {error}
          </Toast>
        )}
        <p>
          Are you at the collection centre for <strong>{target?.number}</strong>
          ? Staff will see your arrival after you confirm.
        </p>
        <Button busy={busy} onClick={() => void confirm()}>
          I'm at the collection centre
        </Button>
      </Dialog>
    </BuyerPage>
  );
}
