'use client';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatNaira, type UnsoldLot } from '@auction-ng/shared';
import { createRelistClient } from '@auction-ng/api-client/relist';
import { ApiError } from '@auction-ng/api-client/auth';
import { Button } from '@auction-ng/ui/web/button';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Input } from '@auction-ng/ui/web/input';
import { NairaInput } from '@auction-ng/ui/web/naira-input';
import { ImageOff, RotateCcw } from '@auction-ng/ui/web/icons';
import { productImageSource } from '@auction-ng/ui/web/demo-image';
import {
  BulkDialog,
  BulkResult,
  SelectionBar,
  type BulkAction,
  type BulkOutcome,
} from './unsold-bulk';
import { UnsoldDeleted } from './unsold-deleted';
import {
  newSchedule,
  ScheduleFields,
  scheduleReady,
  scheduleStart,
  scheduleText,
  wat,
} from './unsold-schedule';

type Credentials = {
  apiUrl: string;
  accessToken: string;
  deviceId: string;
};
// Selecting every waiting item stops here, so one action stays quick.
const SELECT_MAX = 500;
const REFRESH_EVENTS = ['giddydeal:staff-refresh', 'focus', 'online'] as const;

/** Live count for the sidebar badge: socket refreshes, focus and online. */
export function useUnsoldCount(
  { apiUrl, accessToken, deviceId }: Credentials,
  enabled: boolean,
) {
  const [count, setCount] = useState<number>();
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const client = createRelistClient(apiUrl, { accessToken, deviceId });
    const read = () => {
      if (document.hidden || !navigator.onLine) return;
      client
        .unsoldCount()
        .then((value) => active && setCount(value.count))
        .catch((cause: unknown) => {
          // Keep the last confirmed count; a signed-out answer goes to the
          // session watchdog.
          if (cause instanceof ApiError && cause.status === 401)
            window.dispatchEvent(new Event('giddydeal:staff-unauthorized'));
        });
    };
    read();
    // Fallback if a socket signal is missed; the socket is the main trigger.
    const timer = setInterval(read, 60000);
    for (const event of REFRESH_EVENTS) window.addEventListener(event, read);
    return () => {
      active = false;
      clearInterval(timer);
      for (const event of REFRESH_EVENTS)
        window.removeEventListener(event, read);
    };
  }, [apiUrl, accessToken, deviceId, enabled]);
  return count;
}

/** Puts the count into the "Unsold review" sidebar item. */
export function UnsoldNavBadge({ count }: { count?: number }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.getElementById('overview-count-unsold-review'));
  });
  return target && count
    ? createPortal(
        <b
          className="is-danger"
          title={`${count} unsold ${count === 1 ? 'item' : 'items'}`}
        >
          {count > 99 ? '99+' : count}
        </b>,
        target,
      )
    : null;
}

export function UnsoldReview({
  credentials,
  online,
  canSetBuyNow,
}: {
  credentials: Credentials;
  online: boolean;
  /** Buy-now prices need auctions.manage, like the fixed price editor. */
  canSetBuyNow: boolean;
}) {
  const [tab, setTab] = useState<'waiting' | 'deleted'>('waiting');
  const client = useMemo(
    () =>
      createRelistClient(credentials.apiUrl, {
        accessToken: credentials.accessToken,
        deviceId: credentials.deviceId,
      }),
    [credentials.apiUrl, credentials.accessToken, credentials.deviceId],
  );
  return (
    <>
      <div className="lv-staff-tabs" role="group" aria-label="Unsold items">
        {(
          [
            ['waiting', 'Waiting'],
            ['deleted', 'Deleted'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'waiting' ? (
        <UnsoldList
          client={client}
          online={online}
          canSetBuyNow={canSetBuyNow}
        />
      ) : (
        <section className="lv-unsold" aria-labelledby="unsold-deleted-heading">
          <h2 id="unsold-deleted-heading">Deleted items</h2>
          <UnsoldDeleted client={client} online={online} />
        </section>
      )}
    </>
  );
}

function UnsoldList({
  client,
  online,
  canSetBuyNow,
}: {
  client: ReturnType<typeof createRelistClient>;
  online: boolean;
  canSetBuyNow: boolean;
}) {
  const [cursor, setCursor] = useState<string>();
  const [pages, setPages] = useState<(string | undefined)[]>([]);
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<Awaited<ReturnType<typeof client.unsold>>>();
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [relisting, setRelisting] = useState<UnsoldLot>();
  // Kept across pages, with each item as it was when ticked: the server
  // refuses an item that changed since.
  const [selected, setSelected] = useState<ReadonlyMap<string, UnsoldLot>>(
    new Map(),
  );
  const [selecting, setSelecting] = useState(false);
  const [bulk, setBulk] = useState<{ action: BulkAction; lots: UnsoldLot[] }>();
  const [outcome, setOutcome] = useState<BulkOutcome>();
  const [selectError, setSelectError] = useState('');
  useEffect(() => {
    let active = true;
    const read = () => {
      if (document.hidden || !navigator.onLine) return;
      client
        .unsold({ cursor, limit: 20 })
        .then((value) => {
          if (!active) return;
          setData(value);
          setError('');
        })
        .catch((cause: unknown) => {
          if (cause instanceof ApiError && cause.status === 401)
            window.dispatchEvent(new Event('giddydeal:staff-unauthorized'));
          // Keep the last list on screen; only say so if there is none.
          if (active) setError('Unsold items could not be loaded.');
        });
    };
    read();
    for (const event of REFRESH_EVENTS) window.addEventListener(event, read);
    return () => {
      active = false;
      for (const event of REFRESH_EVENTS)
        window.removeEventListener(event, read);
    };
  }, [client, cursor, version]);

  const items = data?.items ?? [];
  const selectableTotal = Math.min(data?.total ?? 0, SELECT_MAX);
  const pageTicked = items.filter((lot) => selected.has(lot.id)).length;
  const notice = (text: string) => {
    setOutcome(undefined);
    setToast(text);
  };
  const toggle = (lots: UnsoldLot[], on: boolean) => {
    if (on && selected.size + lots.length > SELECT_MAX) {
      setSelectError(`You can select up to ${SELECT_MAX} items at once.`);
      return;
    }
    setSelectError('');
    setSelected((current) => {
      const next = new Map(current);
      for (const lot of lots)
        if (on) next.set(lot.id, lot);
        else next.delete(lot.id);
      return next;
    });
  };
  async function selectAll() {
    setSelecting(true);
    setSelectError('');
    try {
      const all = new Map<string, UnsoldLot>();
      let after: string | undefined;
      do {
        const page = await client.unsold({ cursor: after, limit: 50 });
        for (const lot of page.items)
          if (all.size < SELECT_MAX) all.set(lot.id, lot);
        after = page.nextCursor ?? undefined;
      } while (after && all.size < SELECT_MAX);
      setSelected(all);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401)
        window.dispatchEvent(new Event('giddydeal:staff-unauthorized'));
      setSelectError('Couldn’t select every item. Check your connection.');
    } finally {
      setSelecting(false);
    }
  }
  return (
    <section className="lv-unsold" aria-labelledby="unsold-heading">
      <header className="lv-unsold-head">
        <div>
          <h2 id="unsold-heading">Unsold items</h2>
          <p>
            These ended with no bids and have no automatic relist left
            {data
              ? ` (${data.settings.maxRetries} automatic ${data.settings.maxRetries === 1 ? 'relist' : 'relists'}, ${data.settings.runHours} hours each)`
              : ''}
            . Relist them here at the same price or a new one, or delete them
            from this list.
          </p>
        </div>
        {data && (
          <span className="lv-unsold-total" aria-live="polite">
            <b>{data.total.toLocaleString('en-NG')}</b> waiting
          </span>
        )}
      </header>
      {toast && (
        <p className="lv-unsold-toast" role="status">
          {toast}
        </p>
      )}
      {outcome && <BulkResult outcome={outcome} />}
      {selectError && (
        <p className="lv-relist-error" role="alert">
          {selectError}
        </p>
      )}
      {data && (items.length > 0 || selected.size > 0) && (
        <SelectionBar
          selected={selected.size}
          onPage={pageTicked}
          pageCount={items.length}
          total={data.total}
          selectableTotal={selectableTotal}
          busy={selecting}
          online={online}
          onTogglePage={() =>
            pageTicked === items.length
              ? toggle(items, false)
              : toggle(
                  items.filter((lot) => !selected.has(lot.id)),
                  true,
                )
          }
          onSelectAll={() => void selectAll()}
          onClear={() => setSelected(new Map())}
          onAction={(action) => {
            notice('');
            setBulk({ action, lots: [...selected.values()] });
          }}
        />
      )}
      {!online && (
        <p className="lv-unsold-note" role="status">
          You’re offline. Relisting is paused until you reconnect.
        </p>
      )}
      {error && data && (
        <p className="lv-unsold-note" role="status">
          Couldn’t refresh. Showing the last list.
        </p>
      )}
      {!data && !error ? (
        <div
          className="lv-unsold-skeleton"
          aria-busy="true"
          aria-label="Loading unsold items"
        />
      ) : !data ? (
        <div className="lv-unsold-state" role="alert">
          <p>{error}</p>
          <Button variant="secondary" onClick={() => setVersion((v) => v + 1)}>
            Try again
          </Button>
        </div>
      ) : !items.length ? (
        <div className="lv-unsold-state">
          <h3>No unsold items.</h3>
          <p>
            Items appear here when an auction ends with no bids and its
            automatic relists are used up.
          </p>
        </div>
      ) : (
        <ul className="lv-unsold-list">
          {items.map((lot) => (
            <li
              key={lot.id}
              className="lv-unsold-row"
              data-selected={selected.has(lot.id) ? '' : undefined}
            >
              <label className="lv-unsold-check">
                <input
                  type="checkbox"
                  aria-label={`Select ${lot.title}, ${lot.lotNumber}`}
                  checked={selected.has(lot.id)}
                  disabled={selecting}
                  onChange={() => toggle([lot], !selected.has(lot.id))}
                />
              </label>
              <span className="lv-unsold-photo">
                {lot.imageUrl ? (
                  // Staff thumbnails come from our own image store.
                  <img
                    src={productImageSource(lot.imageUrl)}
                    alt=""
                    loading="lazy"
                    width={64}
                    height={64}
                  />
                ) : (
                  <ImageOff size={20} aria-hidden="true" />
                )}
              </span>
              <span className="lv-unsold-main">
                <strong>{lot.title}</strong>
                <small>
                  {lot.lotNumber} · Ended {wat(lot.closedAt)} with no bids
                </small>
                <small>
                  {lot.autoRelistCount
                    ? `Relisted automatically ${lot.autoRelistCount} ${lot.autoRelistCount === 1 ? 'time' : 'times'}`
                    : 'Not relisted yet'}{' '}
                  · {lot.locationName}
                  {lot.binCode ? ` · Bin ${lot.binCode}` : ' · No bin'}
                </small>
              </span>
              <span className="lv-unsold-price">
                <b>{formatNaira(lot.startPriceKobo)}</b>
                <small>starting price</small>
              </span>
              <Button
                variant="primary"
                size="small"
                disabled={!online}
                onClick={() => {
                  notice('');
                  setRelisting(lot);
                }}
              >
                <RotateCcw size={16} aria-hidden="true" /> Relist
              </Button>
            </li>
          ))}
        </ul>
      )}
      {(pages.length > 0 || data?.nextCursor) && (
        <nav className="lv-staff-pagination" aria-label="Unsold item pages">
          <Button
            variant="secondary"
            disabled={!pages.length}
            onClick={() => {
              setCursor(pages.at(-1));
              setPages((p) => p.slice(0, -1));
            }}
          >
            Previous
          </Button>
          <span>Page {pages.length + 1}</span>
          <Button
            variant="secondary"
            disabled={!data?.nextCursor}
            onClick={() => {
              setPages((p) => [...p, cursor]);
              setCursor(data?.nextCursor ?? undefined);
            }}
          >
            Next
          </Button>
        </nav>
      )}
      {relisting && data && (
        <RelistDialog
          key={relisting.id}
          lot={relisting}
          defaultHours={data.settings.runHours}
          canSetBuyNow={canSetBuyNow}
          online={online}
          onClose={() => setRelisting(undefined)}
          onDone={(message) => {
            setRelisting(undefined);
            notice(message);
            setSelected((current) => {
              const next = new Map(current);
              next.delete(relisting.id);
              return next;
            });
            setVersion((v) => v + 1);
            window.dispatchEvent(new Event('giddydeal:staff-refresh'));
          }}
          relist={(input) => client.relist(relisting.id, input)}
        />
      )}
      {bulk && data && (
        <BulkDialog
          action={bulk.action}
          lots={bulk.lots}
          client={client}
          defaultHours={data.settings.runHours}
          online={online}
          onClose={() => setBulk(undefined)}
          onDone={(result) => {
            const skipped = new Set(result.skipped.map((item) => item.id));
            setBulk(undefined);
            notice('');
            setOutcome(result);
            // Skipped items stay ticked so staff can see and retry them.
            setSelected(
              new Map([...selected].filter(([id]) => skipped.has(id))),
            );
            // A whole page may be gone: start again from the first.
            setCursor(undefined);
            setPages([]);
            setVersion((v) => v + 1);
            window.dispatchEvent(new Event('giddydeal:staff-refresh'));
          }}
        />
      )}
    </section>
  );
}

function RelistDialog({
  lot,
  defaultHours,
  canSetBuyNow,
  online,
  onClose,
  onDone,
  relist,
}: {
  lot: UnsoldLot;
  defaultHours: number;
  canSetBuyNow: boolean;
  online: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
  relist: (
    input: Parameters<ReturnType<typeof createRelistClient>['relist']>[1],
  ) => Promise<{ message: string; startsAt: string }>;
}) {
  const [price, setPrice] = useState<number | undefined>(lot.startPriceKobo);
  const [fixed, setFixed] = useState<number | undefined>(
    lot.fixedPriceKobo ?? undefined,
  );
  const [schedule, setSchedule] = useState(() => newSchedule(defaultHours));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // One key per attempt: a retry after a network error can't relist twice.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const ready =
    online &&
    !!price &&
    price > 0 &&
    scheduleReady(schedule) &&
    reason.trim().length >= 5 &&
    !busy;
  const summary =
    price && price > 0 && scheduleReady(schedule)
      ? `${scheduleText(schedule)} for ${schedule.hours} hours at ${formatNaira(price)}${fixed ? `, or ${formatNaira(fixed)} to buy now` : ''}.`
      : 'Enter a starting price and start time.';

  async function submit() {
    if (!ready || !price) return;
    setBusy(true);
    setErrors({});
    try {
      const result = await relist({
        startPriceKobo: price,
        fixedPriceKobo: fixed ?? null,
        startsAt: scheduleStart(schedule),
        runHours: schedule.hours,
        expectedUpdatedAt: lot.updatedAt,
        idempotencyKey: key,
        reason: reason.trim(),
      });
      onDone(`${lot.title}: ${result.message}`);
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'FIELD_ERROR')
        setErrors({ [failure.field ?? 'form']: failure.detail ?? '' });
      else if (failure instanceof ApiError && failure.status === 409) {
        setKey(crypto.randomUUID());
        setErrors({
          form: 'This item was relisted or changed by someone else. Close this and reload the list.',
        });
      } else if (failure instanceof ApiError && failure.status === 403)
        setErrors({ form: 'Your role can’t relist items. Ask an admin.' });
      else
        setErrors({
          form: 'The relist couldn’t be confirmed. Check your connection and try again; it won’t be relisted twice.',
        });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={busy ? () => undefined : onClose} title="Relist item">
      <form
        className="lv-relist-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <p className="lv-relist-item">
          <strong>{lot.title}</strong>
          <small>
            {lot.lotNumber} · Last starting price{' '}
            {formatNaira(lot.startPriceKobo)}
          </small>
        </p>
        <NairaInput
          label="Starting price (₦)"
          initialValue={String(lot.startPriceKobo / 100)}
          onAmountChange={setPrice}
          error={errors.startPriceKobo}
          required
        />
        <NairaInput
          label="Buy now price (₦, optional)"
          initialValue={
            lot.fixedPriceKobo ? String(lot.fixedPriceKobo / 100) : ''
          }
          onAmountChange={setFixed}
          error={errors.fixedPriceKobo}
          disabled={!canSetBuyNow}
          hint={
            canSetBuyNow
              ? 'Leave empty for auction only.'
              : 'Stays as it was. Only staff who manage auctions can change it.'
          }
        />
        <ScheduleFields
          value={schedule}
          defaultHours={defaultHours}
          error={errors.startsAt}
          onChange={setSchedule}
        />
        <Input
          label="Reason"
          value={reason}
          maxLength={500}
          placeholder="e.g. Lower price after no bids"
          onChange={(event) => setReason(event.target.value)}
          hint="Saved in the audit log."
          required
        />
        <p className="lv-relist-summary" aria-live="polite">
          {summary} Photos, condition, bin and item details stay the same.
        </p>
        {errors.form && (
          <p className="lv-relist-error" role="alert">
            {errors.form}
          </p>
        )}
        <div className="lv-relist-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="submit" busy={busy} disabled={!ready}>
            {schedule.when === 'now' ? 'Relist now' : 'Schedule relist'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
