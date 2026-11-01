'use client';
import { useEffect, useRef, useState } from 'react';
import { createPickupVisitClient } from '@auction-ng/api-client/pickup-visits';
import { ApiError } from '@auction-ng/api-client/auth';
import type {
  PickupVisit,
  PickupVisitItems,
  CollectionInput,
} from '@auction-ng/shared/pickup-visit-schemas';
import { PickupDeskPanel } from '@auction-ng/ui/web/pickup-visit';
import { PickupCamera } from '@auction-ng/ui/web/pickup-camera';
import { Button } from '@auction-ng/ui/web/button';
import { Input } from '@auction-ng/ui/web/input';
import { Toast } from '@auction-ng/ui/web/toast';
import { Dialog } from '@auction-ng/ui/web/dialog';
import {
  WalletNotice,
  WalletPagination,
} from '@auction-ng/ui/web/wallet-workspace';
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
type Item = PickupVisitItems['items'][number];
export function PickupArrivals({
  accessToken,
  deviceId,
  online,
}: {
  accessToken: string;
  deviceId: string;
  online: boolean;
}) {
  const client = () =>
    createPickupVisitClient(apiUrl, { accessToken, deviceId });
  const [pages, setPages] = useState<(string | undefined)[]>([undefined]),
    [queue, setQueue] = useState<{
      items: PickupVisit[];
      nextCursor: string | null;
    }>(),
    [queueError, setQueueError] = useState(''),
    [version, setVersion] = useState(0),
    [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [visitId, setVisitId] = useState<string>(),
    [itemPages, setItemPages] = useState<(string | undefined)[]>([undefined]),
    [details, setDetails] = useState<PickupVisitItems>(),
    [itemsError, setItemsError] = useState(''),
    [selected, setSelected] = useState<Record<string, Item>>({}),
    [itemNumber, setItemNumber] = useState(''),
    [keepOpen, setKeepOpen] = useState(false),
    [confirmation, setConfirmation] = useState<CollectionInput>(),
    [confirmOpen, setConfirmOpen] = useState(false),
    [attempted, setAttempted] = useState(false),
    [cancelOpen, setCancelOpen] = useState(false),
    [reason, setReason] = useState('');
  const cursor = pages.at(-1),
    itemCursor = itemPages.at(-1),
    active = useRef(visitId);
  active.current = visitId;
  useEffect(() => setQueue(undefined), [cursor]);
  useEffect(() => {
    let alive = true,
      running = false;
    const read = async () => {
      if (running || document.hidden) return;
      if (!navigator.onLine) {
        if (alive) setQueueError('Queue is offline. Reconnect and retry.');
        return;
      }
      running = true;
      try {
        const value = await createPickupVisitClient(apiUrl, {
          accessToken,
          deviceId,
        }).queue({ limit: 10, cursor });
        if (alive) {
          setQueue(value);
          setQueueError('');
        }
      } catch {
        if (alive)
          setQueueError(
            'Pickup queue could not be refreshed. Check your connection and retry.',
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
      alive = false;
      clearInterval(timer);
      window.removeEventListener('focus', read);
      window.removeEventListener('online', read);
    };
  }, [accessToken, deviceId, cursor, version]);
  useEffect(() => setDetails(undefined), [visitId, itemCursor]);
  useEffect(() => {
    if (!visitId) return;
    let alive = true,
      running = false;
    const read = async () => {
      if (running || document.hidden) return;
      if (!navigator.onLine) {
        if (alive)
          setItemsError(
            'Item checklist is offline. Reconnect before confirming collection.',
          );
        return;
      }
      running = true;
      try {
        const value = await createPickupVisitClient(apiUrl, {
          accessToken,
          deviceId,
        }).items(visitId, { limit: 10, cursor: itemCursor });
        if (alive) {
          setDetails(value);
          setItemsError('');
        }
      } catch {
        if (alive)
          setItemsError(
            'Pickup items could not be refreshed. Retry before confirming collection.',
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
      alive = false;
      clearInterval(timer);
      window.removeEventListener('focus', read);
      window.removeEventListener('online', read);
    };
  }, [accessToken, deviceId, visitId, itemCursor, version]);
  const open = (id: string) => {
    setVisitId(id);
    setItemPages([undefined]);
    setSelected({});
    setKeepOpen(false);
    setError('');
    setMessage('');
  };
  const scan = async (value: string) => {
    if (busy || !online || confirmation) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const visit = await client().scan(value);
      setCode('');
      open(visit.id);
      setMessage(
        visit.status === 'waiting'
          ? 'Buyer checked in. Verify the items below before handover.'
          : 'This pass belongs to a finished visit. It has not created another arrival.',
      );
      setVersion((v) => v + 1);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 429
          ? 'Too many scans. Wait before trying again.'
          : 'Pass could not be accepted. Check the code, expiry and connection, then try again.',
      );
    } finally {
      setBusy(false);
    }
  };
  const select = (item: Item, checked: boolean) => {
    setSelected((current) => {
      const next = { ...current };
      if (checked) {
        if (Object.keys(current).length >= 50 && !current[item.id]) {
          setError(
            'Confirm up to 50 items at a time, then continue this visit.',
          );
          return current;
        }
        next[item.id] = item;
      } else delete next[item.id];
      return next;
    });
  };
  const findItem = async () => {
    if (!visitId || busy || confirmation) return;
    setBusy(true);
    setError('');
    try {
      const value = await client().items(visitId, {
        limit: 1,
        itemNumber: itemNumber.trim().toUpperCase(),
      });
      if (active.current !== visitId) return;
      const item = value.items[0];
      if (!item) {
        setError(
          'Item not found among this buyer’s eligible pickup items. Check the item ID.',
        );
        return;
      }
      select(item, true);
      setItemNumber('');
    } catch {
      setError(
        'The item could not be checked. Check your connection and item ID, then retry.',
      );
    } finally {
      setBusy(false);
    }
  };
  const collect = async () => {
    if (!visitId || !confirmation || busy || !online) return;
    setBusy(true);
    setAttempted(true);
    setError('');
    try {
      const receipt = await client().collect(visitId, confirmation);
      setConfirmOpen(false);
      setConfirmation(undefined);
      setAttempted(false);
      setSelected({});
      setMessage(
        `${receipt.lineIds.length} item${receipt.lineIds.length === 1 ? '' : 's'} confirmed collected.${receipt.finishVisit ? ' Visit completed. Remaining items stay awaiting pickup.' : ' Continue with the remaining items.'}`,
      );
      if (receipt.finishVisit) setVisitId(undefined);
      setVersion((v) => v + 1);
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        [400, 403, 404, 409].includes(cause.status)
      ) {
        setConfirmOpen(false);
        setConfirmation(undefined);
        setAttempted(false);
        setSelected({});
        setError(
          'Collection could not be accepted. The items or visit may have changed. Refresh and review the checklist.',
        );
        setVersion((v) => v + 1);
      } else
        setError(
          'Collection could not be confirmed. Check your connection and retry this same confirmation. Do not hand over additional items until confirmed.',
        );
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    if (!visitId || busy || !online) return;
    setBusy(true);
    setError('');
    try {
      await client().cancel(visitId, reason);
      setCancelOpen(false);
      setVisitId(undefined);
      setReason('');
      setMessage('Visit cancelled. No items were marked collected.');
      setVersion((v) => v + 1);
    } catch {
      setError('Visit cancellation could not be confirmed. Refresh and retry.');
    } finally {
      setBusy(false);
    }
  };
  const count = Object.keys(selected).length;
  return (
    <div>
      {message && (
        <Toast tone="success" emphasis onClose={() => setMessage('')}>
          {message}
        </Toast>
      )}
      {error && !confirmOpen && !cancelOpen && (
        <Toast tone="error" emphasis onClose={() => setError('')}>
          {error}
        </Toast>
      )}
      <div className="agn-visit-desk-grid">
        <PickupDeskPanel title="Check in a buyer">
          <p>
            Scan one arrival pass or enter its 8-character code. Their paid
            items at this centre appear together.
          </p>
          <form
            className="agn-visit-scan-form"
            onSubmit={(e) => {
              e.preventDefault();
              void scan(code);
            }}
          >
            <Input
              label="Scan pass or enter code"
              autoComplete="off"
              value={code}
              disabled={busy || !!confirmation || !online}
              onChange={(e) => setCode(e.target.value)}
            />
            <Button
              busy={busy}
              disabled={!code.trim() || !!confirmation || !online}
              type="submit"
            >
              Register arrival
            </Button>
          </form>
          <PickupCamera
            disabled={busy || !!confirmation || !online}
            onScan={(value) => {
              setCode(value);
              void scan(value);
            }}
          />
        </PickupDeskPanel>
        <PickupDeskPanel title="Pickup queue">
          {queueError && (
            <WalletNotice onRetry={() => setVersion((v) => v + 1)}>
              {queueError}
            </WalletNotice>
          )}
          {!queue ? (
            !queueError && <p role="status">Loading queue…</p>
          ) : queue.items.length ? (
            queue.items.map((visit) => (
              <div key={visit.id} className="agn-visit-queue-row">
                <div>
                  <strong>{visit.buyerName}</strong>
                  <small>{visit.location}</small>
                  <small>
                    Arrived{' '}
                    {new Date(visit.createdAt).toLocaleTimeString('en-NG', {
                      timeZone: 'Africa/Lagos',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    WAT
                  </small>
                </div>
                <Button
                  variant="secondary"
                  disabled={busy || !!confirmation || !online}
                  onClick={() => open(visit.id)}
                >
                  Open visit
                </Button>
              </div>
            ))
          ) : (
            <p>No buyers are waiting on this page.</p>
          )}
          <WalletPagination
            page={pages.length}
            size={10}
            hasNext={!!queue?.nextCursor}
            onPrevious={() =>
              setPages((p) => (p.length > 1 ? p.slice(0, -1) : p))
            }
            onNext={() => {
              if (queue?.nextCursor)
                setPages((p) => [...p, queue.nextCursor ?? undefined]);
            }}
          />
        </PickupDeskPanel>
      </div>
      {visitId && (
        <PickupDeskPanel title="Collection checklist">
          {itemsError && (
            <WalletNotice onRetry={() => setVersion((v) => v + 1)}>
              {itemsError}
            </WalletNotice>
          )}
          {!details ? (
            !itemsError && <p role="status">Loading paid pickup items…</p>
          ) : (
            <>
              <h3>{details.visit.buyerName}</h3>
              <p>
                {details.visit.location} ·{' '}
                {details.visit.status === 'waiting'
                  ? 'Checked in'
                  : details.visit.status === 'completed'
                    ? 'Visit completed'
                    : 'Visit cancelled'}
              </p>
              {details.visit.status === 'waiting' ? (
                <>
                  <p>
                    Verify the buyer and tick or scan only the items being
                    handed over. Unselected items remain awaiting pickup.
                  </p>
                  <form
                    className="agn-visit-scan-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void findItem();
                    }}
                  >
                    <Input
                      label="Scan or enter item ID"
                      value={itemNumber}
                      onChange={(e) => setItemNumber(e.target.value)}
                      disabled={busy || !!confirmation || !online}
                      autoComplete="off"
                    />
                    <Button
                      type="submit"
                      variant="secondary"
                      disabled={
                        !itemNumber.trim() || busy || !!confirmation || !online
                      }
                    >
                      Add item to collection
                    </Button>
                  </form>
                  <ul className="agn-visit-items">
                    {details.items.map((item) => (
                      <li key={item.id}>
                        <label>
                          <input
                            type="checkbox"
                            aria-label={`Collect ${item.itemNumber}`}
                            checked={!!selected[item.id]}
                            disabled={
                              busy || !!confirmation || !!itemsError || !online
                            }
                            onChange={(e) => select(item, e.target.checked)}
                          />
                          <span>
                            <strong>{item.title}</strong>
                            <small>
                              Item {item.itemNumber} · Order{' '}
                              {item.invoiceNumber}
                            </small>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  {!details.items.length && (
                    <p>
                      No uncollected items on this page. Check the previous page
                      or cancel an abandoned visit.
                    </p>
                  )}
                  <WalletPagination
                    page={itemPages.length}
                    size={10}
                    hasNext={!!details.nextCursor}
                    onPrevious={() => {
                      if (!confirmation)
                        setItemPages((p) =>
                          p.length > 1 ? p.slice(0, -1) : p,
                        );
                    }}
                    onNext={() => {
                      if (!confirmation && details.nextCursor)
                        setItemPages((p) => [
                          ...p,
                          details.nextCursor ?? undefined,
                        ]);
                    }}
                  />
                  <label className="agn-consent">
                    <input
                      type="checkbox"
                      checked={keepOpen}
                      disabled={busy || !!confirmation || !online}
                      onChange={(e) => setKeepOpen(e.target.checked)}
                    />
                    Keep this visit open for more items after this handover
                  </label>
                </>
              ) : (
                <p>
                  This visit is finished. Uncollected items remain available for
                  another visit.
                </p>
              )}
            </>
          )}
          <div className="agn-visit-actions">
            <Button
              disabled={
                busy ||
                !online ||
                (!confirmation &&
                  (!count ||
                    !!itemsError ||
                    details?.visit.status !== 'waiting'))
              }
              onClick={() => {
                if (!confirmation) {
                  setConfirmation({
                    idempotencyKey: crypto.randomUUID(),
                    lineIds: Object.keys(selected).sort(),
                    finishVisit: !keepOpen,
                  });
                  setAttempted(false);
                }
                setError('');
                setConfirmOpen(true);
              }}
            >
              {confirmation
                ? 'Retry collection confirmation'
                : `Confirm collection (${count})`}
            </Button>
            <Button
              variant="danger"
              disabled={
                busy ||
                !online ||
                !!confirmation ||
                details?.visit.status !== 'waiting'
              }
              onClick={() => {
                setReason('');
                setError('');
                setCancelOpen(true);
              }}
            >
              Cancel abandoned visit
            </Button>
          </div>
        </PickupDeskPanel>
      )}
      <Dialog
        open={confirmOpen}
        title="Confirm item handover"
        onClose={() => {
          if (!busy) {
            setConfirmOpen(false);
            if (!attempted) setConfirmation(undefined);
          }
        }}
      >
        {error && (
          <Toast tone="error" emphasis onClose={() => setError('')}>
            {error}
          </Toast>
        )}
        <p>
          Confirm these <strong>{confirmation?.lineIds.length} items</strong>{' '}
          have been handed to the correct buyer. This records collection and{' '}
          {confirmation?.finishVisit
            ? 'completes the visit.'
            : 'keeps the visit open.'}
        </p>
        <ul>
          {confirmation?.lineIds.map((id) => (
            <li key={id}>
              {selected[id]?.itemNumber} — {selected[id]?.title}
            </li>
          ))}
        </ul>
        <Button busy={busy} disabled={!online} onClick={() => void collect()}>
          {attempted ? 'Retry same confirmation' : 'Confirm handover'}
        </Button>
      </Dialog>
      <Dialog
        open={cancelOpen}
        title="Cancel abandoned visit"
        onClose={() => {
          if (!busy) setCancelOpen(false);
        }}
      >
        {error && (
          <Toast tone="error" emphasis onClose={() => setError('')}>
            {error}
          </Toast>
        )}
        <p>
          This removes the visit from the queue without marking any additional
          items collected.
        </p>
        <Input
          label="Reason for cancellation"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
        />
        <Button
          variant="danger"
          busy={busy}
          disabled={!online || reason.trim().length < 5}
          onClick={() => void cancel()}
        >
          Cancel visit
        </Button>
      </Dialog>
    </div>
  );
}
