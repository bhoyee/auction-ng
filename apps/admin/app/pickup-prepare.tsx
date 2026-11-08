'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  TriangleAlert as AlertTriangle,
  CircleCheck as CheckCircle2,
  PackageSearch,
  ScanLine,
  Settings2,
} from '@auction-ng/ui/web/icons';
import { createPickupStorageClient } from '@auction-ng/api-client/pickup-storage';
import { ApiError } from '@auction-ng/api-client/auth';
import {
  StaffMessage,
  StaffSearch,
} from '@auction-ng/ui/web/staff-dashboard-view';
import { Button } from '@auction-ng/ui/web/button';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Select } from '@auction-ng/ui/web/select';
import { Input } from '@auction-ng/ui/web/input';
import { WalletPagination } from '@auction-ng/ui/web/wallet-workspace';
import { productImageSource } from '@auction-ng/ui/web/product-photo';
import {
  normalisePickupReference,
  pickupPrepareReasons,
  pickupPrepareTone,
  pickupPrepareWait,
  PICKUP_PREPARE_ALERT_HOURS,
  PICKUP_PREPARE_WARN_HOURS,
  type PickupPrepareItem,
  type PickupPreparePage,
} from '@auction-ng/shared';
import { StorageCentreSettings } from './storage-centre-settings';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const buyerUrl = process.env.NEXT_PUBLIC_BUYER_URL || 'http://localhost:3300';
const MAX_BATCH = 50;
const paidFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Lagos',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function PickupPrepare({
  accessToken,
  deviceId,
  canConfigure,
  onCount,
}: {
  accessToken: string;
  deviceId: string;
  canConfigure: boolean;
  onCount?: (count: number | undefined) => void;
}) {
  const client = () =>
    createPickupStorageClient(apiUrl, { accessToken, deviceId });
  const [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [locationId, setLocationId] = useState('');
  const [pages, setPages] = useState<(string | undefined)[]>([undefined]);
  const [data, setData] = useState<PickupPreparePage>(),
    [readError, setReadError] = useState(''),
    [version, setVersion] = useState(0),
    [offset, setOffset] = useState(0),
    [tick, setTick] = useState(0);
  const [selected, setSelected] = useState<Record<string, PickupPrepareItem>>(
    {},
  );
  const [scan, setScan] = useState(''),
    [scanBusy, setScanBusy] = useState(false),
    [scanNote, setScanNote] = useState<{
      tone: 'success' | 'error';
      text: string;
    }>();
  const scanField = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<PickupPrepareItem[]>([]),
    [reason, setReason] = useState<string>(pickupPrepareReasons[0]),
    [note, setNote] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [requestKey, setRequestKey] = useState(() => crypto.randomUUID()),
    [settings, setSettings] = useState(false);
  const onCountRef = useRef(onCount);
  onCountRef.current = onCount;

  useEffect(() => {
    let alive = true,
      running = false;
    async function read() {
      if (running || document.hidden) return;
      running = true;
      try {
        const value = await createPickupStorageClient(apiUrl, {
          accessToken,
          deviceId,
        }).prepare({
          search,
          cursor: pages.at(-1),
          ...(locationId ? { locationId } : {}),
        });
        if (!alive) return;
        setData(value);
        setOffset(new Date(value.serverTime).getTime() - Date.now());
        setReadError('');
        onCountRef.current?.(value.summary.total);
      } catch (cause) {
        if (!alive) return;
        if (cause instanceof ApiError && [401, 403].includes(cause.status)) {
          setData(undefined);
          onCountRef.current?.(undefined);
        }
        setReadError(
          'The preparation queue could not be refreshed. Check your connection and retry.',
        );
      } finally {
        running = false;
      }
    }
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
  }, [accessToken, deviceId, search, locationId, pages, version]);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  const now = useMemo(() => new Date(Date.now() + offset), [offset, tick]);

  const chosen = Object.values(selected);
  const blockedCentres = (data?.summary.centres ?? []).filter(
    (c) => !c.policyEnabled && c.count > 0,
  );
  const rows = data?.items ?? [];
  const selectable = rows.filter((r) => r.policyEnabled);
  const allChecked =
    selectable.length > 0 && selectable.every((r) => selected[r.invoiceLineId]);

  function toggle(item: PickupPrepareItem, on: boolean) {
    setSelected((current) => {
      const next = { ...current };
      if (on && Object.keys(next).length < MAX_BATCH)
        next[item.invoiceLineId] = item;
      if (!on) delete next[item.invoiceLineId];
      return next;
    });
  }
  function toggleAll(on: boolean) {
    setSelected((current) => {
      const next = { ...current };
      for (const r of selectable) {
        if (on && Object.keys(next).length < MAX_BATCH)
          next[r.invoiceLineId] = r;
        if (!on) delete next[r.invoiceLineId];
      }
      return next;
    });
  }
  function resetPage() {
    setPages([undefined]);
    setData(undefined);
  }

  async function lookup() {
    const reference = normalisePickupReference(scan);
    if (!reference || scanBusy) return;
    setScanBusy(true);
    setScanNote(undefined);
    try {
      const result = await client().prepare({ reference, limit: 1 });
      const item = result.items[0];
      if (!item)
        setScanNote({
          tone: 'error',
          text: `${reference} is not waiting for preparation. It may already be ready, collected, unpaid or a delivery order.`,
        });
      else if (!item.policyEnabled)
        setScanNote({
          tone: 'error',
          text: `${item.reference} is at ${item.location}, where the storage policy is off. Enable the centre policy before marking it ready.`,
        });
      else if (selected[item.invoiceLineId])
        setScanNote({
          tone: 'success',
          text: `${item.reference} is already selected.`,
        });
      else if (chosen.length >= MAX_BATCH)
        setScanNote({
          tone: 'error',
          text: `You can confirm up to ${MAX_BATCH} items at a time. Mark these ready first, then keep scanning.`,
        });
      else {
        toggle(item, true);
        setScanNote({
          tone: 'success',
          text: `Added ${item.reference} · ${item.title}`,
        });
      }
    } catch {
      setScanNote({
        tone: 'error',
        text: 'The item could not be checked. Check your connection and scan again.',
      });
    } finally {
      setScan('');
      setScanBusy(false);
      scanField.current?.focus();
    }
  }

  function openConfirm(items: PickupPrepareItem[]) {
    if (!items.length) return;
    setReason(pickupPrepareReasons[0]);
    setNote('');
    setError('');
    setRequestKey(crypto.randomUUID());
    setTarget(items);
  }

  async function confirm() {
    if (busy || !target.length) return;
    setBusy(true);
    setError('');
    const text = note.trim() ? `${reason}. ${note.trim()}` : reason;
    try {
      await client().ready({
        idempotencyKey: requestKey,
        lineIds: target.map((c) => c.invoiceLineId),
        reason: text,
      });
      setMessage(
        target.length === 1
          ? `${target[0]?.reference ?? 'Item'} is ready. The buyer has been sent their pickup deadline.`
          : `${target.length} items are ready. Each buyer has been sent their pickup deadline.`,
      );
      setSelected((current) => {
        const next = { ...current };
        for (const t of target) delete next[t.invoiceLineId];
        return next;
      });
      setTarget([]);
      setVersion((v) => v + 1);
    } catch (cause) {
      setRequestKey(crypto.randomUUID());
      if (
        cause instanceof ApiError &&
        cause.code === 'PICKUP_STORAGE_POLICY_REQUIRED'
      )
        setError(
          'A selected item is at a centre whose storage policy is off. Enable the centre policy, then try again. Nothing was marked ready.',
        );
      else if (
        cause instanceof ApiError &&
        cause.code === 'PICKUP_STORAGE_NOT_ELIGIBLE'
      ) {
        setError(
          'One or more selected items changed since you picked them (collected, refunded or no longer a pickup). Nothing was marked ready. The list has been refreshed; review the selection and try again.',
        );
        setVersion((v) => v + 1);
      } else
        setError(
          'Readiness was not confirmed. Check your connection and staff access, then try again. Nothing was marked ready.',
        );
    } finally {
      setBusy(false);
    }
  }

  const summary = data?.summary;
  return (
    <section className="lv-pickup-page" aria-labelledby="prepare-title">
      <header className="lv-pickup-page-head">
        <div>
          <h2 id="prepare-title">Prepare items for pickup</h2>
          <p>
            Paid items waiting to be found and staged. Marking an item ready
            starts the buyer’s five-working-day pickup window and sends them the
            exact deadline.
          </p>
        </div>
        {canConfigure && (
          <Button variant="secondary" onClick={() => setSettings(true)}>
            <Settings2 size={18} aria-hidden="true" /> Centre policy
          </Button>
        )}
      </header>

      <div className="lv-pickup-kpis" aria-label="Preparation summary">
        <Kpi label="Waiting to prepare" value={summary?.total} />
        <Kpi
          label={`Waiting over ${PICKUP_PREPARE_WARN_HOURS} h`}
          value={summary?.overWarn}
          tone={summary?.overWarn ? 'warn' : undefined}
        />
        <Kpi
          label={`Waiting over ${PICKUP_PREPARE_ALERT_HOURS} h`}
          value={summary?.overAlert}
          tone={summary?.overAlert ? 'alert' : undefined}
        />
        <Kpi
          label="Oldest waiting"
          text={
            summary
              ? summary.oldestPaidAt
                ? pickupPrepareWait(summary.oldestPaidAt, now)
                : 'None'
              : undefined
          }
        />
      </div>

      {blockedCentres.map((c) => (
        <div className="lv-pickup-alert" role="alert" key={c.locationId}>
          <AlertTriangle size={20} aria-hidden="true" />
          <div>
            <strong>
              {c.location}: storage policy is off ({c.count}{' '}
              {c.count === 1 ? 'item' : 'items'} waiting)
            </strong>
            <span>
              Set the centre’s working days, hours and storage charges, then
              enable the policy before marking these items ready.
            </span>
          </div>
          {canConfigure && (
            <Button variant="secondary" onClick={() => setSettings(true)}>
              Open centre policy
            </Button>
          )}
        </div>
      ))}
      {message && (
        <StaffMessage tone="success" onDismiss={() => setMessage('')}>
          {message}
        </StaffMessage>
      )}
      {readError && (
        <StaffMessage onDismiss={() => setReadError('')}>
          {readError}
        </StaffMessage>
      )}

      <form
        className="lv-pickup-scan"
        onSubmit={(e) => {
          e.preventDefault();
          void lookup();
        }}
      >
        <ScanLine
          size={22}
          aria-hidden="true"
          className="lv-pickup-scan-icon"
        />
        <label htmlFor="prepare-scan">
          <strong>Scan or type item ID</strong>
          <span>Each scan adds the item to your selection.</span>
        </label>
        <input
          id="prepare-scan"
          ref={scanField}
          value={scan}
          onChange={(e) => setScan(e.target.value)}
          placeholder="e.g. LV8Q7R6P"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={200}
        />
        <Button type="submit" busy={scanBusy} disabled={!scan.trim()}>
          Add item
        </Button>
        {scanNote && (
          <p
            className={
              'lv-pickup-scan-note lv-pickup-scan-note--' + scanNote.tone
            }
            role={scanNote.tone === 'error' ? 'alert' : 'status'}
          >
            {scanNote.tone === 'success' ? (
              <CheckCircle2 size={16} aria-hidden="true" />
            ) : (
              <AlertTriangle size={16} aria-hidden="true" />
            )}
            {scanNote.text}
          </p>
        )}
      </form>

      <div className="lv-pickup-card">
        <div className="lv-pickup-card-head">
          <div>
            <h3>Waiting items</h3>
            <p>Oldest payment first · times in WAT</p>
          </div>
          <div className="lv-pickup-filters">
            {(summary?.centres.length ?? 0) > 1 && (
              <Select
                label="Centre"
                value={locationId}
                onChange={(e) => {
                  setLocationId(e.target.value);
                  resetPage();
                }}
              >
                <option value="">All centres</option>
                {summary?.centres.map((c) => (
                  <option key={c.locationId} value={c.locationId}>
                    {c.location} ({c.count})
                  </option>
                ))}
              </Select>
            )}
            <StaffSearch
              value={query}
              onChange={setQuery}
              onSearch={(v) => {
                setSearch(v);
                resetPage();
              }}
              placeholder="Search item, invoice or buyer"
            />
          </div>
        </div>

        {chosen.length > 0 && (
          <div
            className="lv-pickup-selection"
            role="region"
            aria-label="Selection"
          >
            <span>
              <strong>{chosen.length}</strong> selected
              {chosen.length >= MAX_BATCH ? ` · maximum ${MAX_BATCH}` : ''}
            </span>
            <div>
              <Button
                variant="danger"
                size="small"
                onClick={() => setSelected({})}
              >
                Clear
              </Button>
              <Button size="small" onClick={() => openConfirm(chosen)}>
                Mark {chosen.length} ready
              </Button>
            </div>
          </div>
        )}

        {!data && !readError && (
          <div
            className="lv-pickup-skeleton"
            role="status"
            aria-label="Loading waiting items"
          >
            {[0, 1, 2].map((i) => (
              <span key={i} />
            ))}
          </div>
        )}
        {data && rows.length === 0 && (
          <div className="lv-pickup-empty">
            <PackageSearch size={28} aria-hidden="true" />
            <strong>
              {search || locationId
                ? 'No waiting items match'
                : 'All caught up'}
            </strong>
            <span>
              {search || locationId
                ? 'Try another item ID, invoice, buyer or centre.'
                : 'Every paid pickup item has been marked ready. New wins appear here once paid.'}
            </span>
          </div>
        )}
        {rows.length > 0 && (
          <div className="lv-pickup-table-wrap">
            <table className="lv-pickup-table">
              <thead>
                <tr>
                  <th scope="col" className="lv-pickup-check">
                    <label className="lv-monitor-checkbox">
                      <input
                        type="checkbox"
                        aria-label="Select all items on this page"
                        checked={allChecked}
                        disabled={!selectable.length}
                        onChange={(e) => toggleAll(e.target.checked)}
                      />
                    </label>
                  </th>
                  <th scope="col">Item</th>
                  <th scope="col">Buyer</th>
                  <th scope="col">Centre</th>
                  <th scope="col">Paid</th>
                  <th scope="col">Waiting</th>
                  <th scope="col">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => {
                  const tone = pickupPrepareTone(item.paidAt, now);
                  const on = !!selected[item.invoiceLineId];
                  return (
                    <tr key={item.invoiceLineId} aria-selected={on}>
                      <td className="lv-pickup-check">
                        <label className="lv-monitor-checkbox">
                          <input
                            type="checkbox"
                            aria-label={`Select ${item.reference}`}
                            checked={on}
                            disabled={!item.policyEnabled}
                            onChange={(e) => toggle(item, e.target.checked)}
                          />
                        </label>
                      </td>
                      <td>
                        <div className="lv-pickup-item">
                          {item.thumbnailUrl ? (
                            <img
                              src={
                                new URL(
                                  productImageSource(item.thumbnailUrl),
                                  buyerUrl,
                                ).href
                              }
                              alt=""
                              width={44}
                              height={44}
                              loading="lazy"
                            />
                          ) : (
                            <span className="lv-pickup-photo-empty" />
                          )}
                          <div>
                            <strong>{item.title}</strong>
                            <small>
                              {item.reference} · {item.invoiceNumber}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td data-label="Buyer">{item.buyerName}</td>
                      <td data-label="Centre">
                        {item.location}
                        {!item.policyEnabled && (
                          <small className="lv-pickup-policy-off">
                            Storage policy off
                          </small>
                        )}
                      </td>
                      <td data-label="Paid">
                        {paidFormat.format(new Date(item.paidAt))}
                      </td>
                      <td data-label="Waiting">
                        <span
                          className={'lv-pickup-wait lv-pickup-wait--' + tone}
                        >
                          {pickupPrepareWait(item.paidAt, now)}
                        </span>
                      </td>
                      <td className="lv-pickup-row-action">
                        <Button
                          variant="secondary"
                          size="small"
                          disabled={!item.policyEnabled}
                          onClick={() => openConfirm([item])}
                        >
                          Mark ready
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && (rows.length > 0 || pages.length > 1) && (
          <div className="lv-pickup-pagination">
            <WalletPagination
              page={pages.length}
              size={25}
              hasNext={!!data.nextCursor}
              onPrevious={() => {
                setPages((p) => (p.length > 1 ? p.slice(0, -1) : p));
                setData(undefined);
              }}
              onNext={() => {
                if (data.nextCursor) {
                  setPages((p) => [...p, data.nextCursor ?? undefined]);
                  setData(undefined);
                }
              }}
            />
          </div>
        )}
      </div>

      <Dialog
        open={target.length > 0}
        onClose={() => {
          if (!busy) setTarget([]);
        }}
        title={
          target.length === 1
            ? 'Mark item ready for pickup'
            : `Mark ${target.length} items ready for pickup`
        }
      >
        <div className="lv-pickup-confirm">
          <p>
            Confirm each item is paid, physically on the collection shelf and
            matches its listing. For each item:
          </p>
          <ul className="lv-pickup-effects">
            <li>The buyer’s five-working-day pickup window starts now.</li>
            <li>
              The buyer gets an email and app notice with their exact deadline
              and the centre’s storage charges.
            </li>
            <li>Nothing is charged now. Storage is only paid at collection.</li>
          </ul>
          <ol
            className="lv-pickup-confirm-list"
            aria-label="Items to mark ready"
          >
            {target.map((c) => (
              <li key={c.invoiceLineId}>
                <span>
                  <strong>{c.reference}</strong> {c.title}
                </span>
                <small>
                  {c.buyerName} · {c.location}
                </small>
              </li>
            ))}
          </ol>
          {error && (
            <StaffMessage onDismiss={() => setError('')}>
              {error}
              {canConfigure && error.startsWith('A selected item') && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setTarget([]);
                    setSettings(true);
                  }}
                >
                  Open centre policy
                </Button>
              )}
            </StaffMessage>
          )}
          <Select
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            {pickupPrepareReasons.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
          <Input
            label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="e.g. Shelf B3"
          />
          <div className="lv-pickup-confirm-actions">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setTarget([])}
            >
              Cancel
            </Button>
            <Button busy={busy} onClick={() => void confirm()}>
              {target.length === 1
                ? 'Mark ready and notify buyer'
                : `Mark ${target.length} ready and notify buyers`}
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog
        open={settings}
        onClose={() => {
          setSettings(false);
          setVersion((v) => v + 1);
        }}
        title="Centre storage policy"
      >
        <StorageCentreSettings accessToken={accessToken} deviceId={deviceId} />
      </Dialog>
    </section>
  );
}

function Kpi({
  label,
  value,
  text,
  tone,
}: {
  label: string;
  value?: number;
  text?: string;
  tone?: 'warn' | 'alert';
}) {
  const shown = text ?? (value === undefined ? undefined : String(value));
  return (
    <div className={'lv-pickup-kpi' + (tone ? ' lv-pickup-kpi--' + tone : '')}>
      <p>{label}</p>
      {shown === undefined ? (
        <span className="lv-pickup-kpi-loading" aria-label="Loading" />
      ) : (
        <strong>{shown}</strong>
      )}
    </div>
  );
}
