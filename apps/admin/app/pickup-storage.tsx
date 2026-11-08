'use client';
import { useEffect, useState } from 'react';
import { createPickupStorageClient } from '@auction-ng/api-client/pickup-storage';
import { ApiError } from '@auction-ng/api-client/auth';
import { CalendarClock, Settings2 } from '@auction-ng/ui/web/icons';
import {
  StaffMessage,
  StaffSearch,
} from '@auction-ng/ui/web/staff-dashboard-view';
import { Button } from '@auction-ng/ui/web/button';
import { Input } from '@auction-ng/ui/web/input';
import { Select } from '@auction-ng/ui/web/select';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { WalletPagination } from '@auction-ng/ui/web/wallet-workspace';
import type {
  StorageCase,
  StorageCasePage,
  StoragePageInput,
  StorageAdjustInput,
} from '@auction-ng/shared';
import { formatNaira } from '@auction-ng/shared';
import { StorageCentreSettings } from './storage-centre-settings';

const storageViews = [
  ['ready', 'Ready'],
  ['due_soon', 'Due soon'],
  ['overdue', 'Overdue'],
  ['review', 'Needs review'],
  ['assigned', 'Assigned to me'],
  ['collected', 'Collected'],
  ['all', 'All'],
] as const satisfies readonly (readonly [StoragePageInput['view'], string])[];
const statusLabel: Record<StorageCase['status'], string> = {
  not_started: 'Not ready',
  ready: 'Ready',
  due_soon: 'Due soon',
  overdue: 'Overdue',
  review: 'Needs review',
  collected: 'Collected',
};
const emptyTitle: Record<string, string> = {
  ready: 'No items in their free pickup window',
  due_soon: 'Nothing due soon',
  overdue: 'No overdue items',
  review: 'No items need review',
  assigned: 'Nothing assigned to you',
  collected: 'No collections yet',
  all: 'No pickup items yet',
};
const deadlineFormat = (value: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value)) + ' WAT';

export function StaffPickupStorage({
  accessToken,
  deviceId,
  canAdjust,
  canConfigure,
}: {
  accessToken: string;
  deviceId: string;
  canAdjust: boolean;
  canConfigure: boolean;
}) {
  const client = () =>
    createPickupStorageClient(
      process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
      { accessToken, deviceId },
    );
  const [view, setView] = useState<StoragePageInput['view']>('ready');
  const [query, setQuery] = useState(''),
    [search, setSearch] = useState('');
  const [pages, setPages] = useState<(string | undefined)[]>([undefined]);
  const [data, setData] = useState<StorageCasePage>(),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [readError, setReadError] = useState('');
  const [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [settings, setSettings] = useState(false);
  const [editing, setEditing] = useState<StorageCase>(),
    [action, setAction] = useState<StorageAdjustInput['action']>('contact');
  const [reason, setReason] = useState(''),
    [dueDate, setDueDate] = useState(''),
    [assignedToId, setAssignedToId] = useState('');
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    let active = true,
      running = false;
    async function refresh() {
      if (running || document.hidden) return;
      running = true;
      try {
        const value = await client().cases({
          view,
          search,
          cursor: pages.at(-1),
          limit: 10,
        });
        if (active) {
          setData(value);
          setReadError('');
        }
      } catch (cause) {
        if (
          active &&
          cause instanceof ApiError &&
          [401, 403].includes(cause.status)
        )
          setData(undefined);
        if (active)
          setReadError(
            'Pickup records could not be refreshed. Check your connection and staff access.',
          );
      } finally {
        running = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
    // The request scope resets rows; token renewal reruns the bounded reader.
  }, [accessToken, deviceId, view, search, pages, version]);
  async function save() {
    if (!editing || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = editing.id
        ? await client().adjust({
            idempotencyKey: requestKey,
            caseId: editing.id,
            expectedRevision: editing.revision,
            reason,
            action,
            ...(action === 'extend' ? { dueDate } : {}),
            ...(action === 'assign'
              ? { assignedToId: assignedToId || null }
              : {}),
          })
        : await client().ready({
            idempotencyKey: requestKey,
            lineIds: [editing.invoiceLineId],
            reason,
          });
      setMessage(result.message);
      setEditing(undefined);
      setVersion((v) => v + 1);
    } catch (cause) {
      setError(
        cause instanceof ApiError &&
          cause.code === 'PICKUP_STORAGE_POLICY_REQUIRED'
          ? 'Enable the collection centre’s storage policy first: open Centre policy, select the centre, check the working days and charges, then enable and save it. No pickup deadline has started for this item.'
          : cause instanceof ApiError &&
              cause.code === 'PICKUP_STORAGE_NOT_ELIGIBLE'
            ? 'This item is not eligible for pickup. Only paid auction wins and Buy Now purchases awaiting collection can be marked ready. Refresh the pickup list.'
            : 'This change was not confirmed. Check the reason, current revision and your permissions; reload before retrying.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="lv-pickup-page" aria-labelledby="storage-title">
      <header className="lv-pickup-page-head">
        <div>
          <h2 id="storage-title">Deadlines & storage</h2>
          <p>
            Items marked ready, with their pickup deadline running. Storage is
            charged per centre working day after the deadline and only paid at
            collection, never taken from a wallet automatically.
          </p>
        </div>
        {canConfigure && (
          <Button variant="secondary" onClick={() => setSettings(true)}>
            <Settings2 size={18} aria-hidden="true" /> Centre policy
          </Button>
        )}
      </header>
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
      {error && !editing && (
        <StaffMessage onDismiss={() => setError('')}>{error}</StaffMessage>
      )}
      <div className="lv-pickup-card">
        <div className="lv-pickup-card-head">
          <div
            className="lv-pickup-chips"
            role="group"
            aria-label="Filter by deadline status"
          >
            {storageViews.map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={view === id}
                onClick={() => {
                  setView(id);
                  setPages([undefined]);
                  setData(undefined);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="lv-pickup-filters">
            <StaffSearch
              value={query}
              onChange={setQuery}
              onSearch={(v) => {
                setSearch(v);
                setPages([undefined]);
                setData(undefined);
              }}
              placeholder="Search item, invoice or buyer"
            />
          </div>
        </div>
        {!data && !readError && (
          <div
            className="lv-pickup-skeleton"
            role="status"
            aria-label="Loading pickup deadlines"
          >
            {[0, 1, 2].map((i) => (
              <span key={i} />
            ))}
          </div>
        )}
        {data && !data.items.length && (
          <div className="lv-pickup-empty">
            <CalendarClock size={28} aria-hidden="true" />
            <strong>
              {search ? 'No items match' : emptyTitle[view ?? 'all']}
            </strong>
            <span>
              {search
                ? 'Try another item ID, invoice or buyer.'
                : 'Items appear here once they are marked ready in Prepare items.'}
            </span>
          </div>
        )}
        {data && data.items.length > 0 && (
          <div className="lv-pickup-table-wrap">
            <table className="lv-pickup-table lv-pickup-table--storage">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Buyer</th>
                  <th scope="col">Status</th>
                  <th scope="col">Collect by</th>
                  <th scope="col">Storage rate</th>
                  <th scope="col" className="lv-pickup-num">
                    Outstanding
                  </th>
                  <th scope="col">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.invoiceLineId}>
                    <td>
                      <div className="lv-pickup-item lv-pickup-item--text">
                        <div>
                          <strong>{item.title}</strong>
                          <small>
                            {item.reference} · {item.invoiceNumber}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td data-label="Buyer">
                      {item.buyerName}
                      <small>{item.location}</small>
                    </td>
                    <td data-label="Status">
                      <span
                        className={
                          'lv-pickup-status lv-pickup-status--' + item.status
                        }
                      >
                        {statusLabel[item.status]}
                      </span>
                      {item.assignedToName && (
                        <small>Assigned: {item.assignedToName}</small>
                      )}
                    </td>
                    <td data-label="Collect by">
                      {item.dueAt ? deadlineFormat(item.dueAt) : 'Not ready'}
                    </td>
                    <td data-label="Storage rate">
                      {!item.id
                        ? '—'
                        : item.waived
                          ? 'Waived'
                          : `${formatNaira(item.dailyKobo)}/day · cap ${formatNaira(item.capKobo)}`}
                    </td>
                    <td data-label="Outstanding" className="lv-pickup-num">
                      <strong>{formatNaira(item.outstandingKobo)}</strong>
                      {item.paidKobo > 0 && (
                        <small>{formatNaira(item.paidKobo)} paid</small>
                      )}
                    </td>
                    <td className="lv-pickup-row-action">
                      {item.status !== 'collected' && (
                        <Button
                          variant="secondary"
                          size="small"
                          onClick={() => {
                            setEditing(item);
                            setRequestKey(crypto.randomUUID());
                            setReason('');
                            setAction('contact');
                          }}
                        >
                          {item.id ? 'Manage' : 'Mark ready'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && (data.items.length > 0 || pages.length > 1) && (
          <div className="lv-pickup-pagination">
            <WalletPagination
              page={pages.length}
              size={10}
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
      <StorageExceptions accessToken={accessToken} deviceId={deviceId} />
      <Dialog
        open={!!editing}
        onClose={() => {
          if (!busy) setEditing(undefined);
        }}
        title={editing?.id ? 'Manage pickup' : 'Confirm item is ready'}
      >
        {editing && (
          <div className="lv-storage-form">
            <strong>
              {editing.title} · {editing.reference}
            </strong>
            {error && (
              <StaffMessage onDismiss={() => setError('')}>
                {error}
                {canConfigure && error.startsWith('Enable the collection') && (
                  <Button
                    onClick={() => {
                      setEditing(undefined);
                      setError('');
                      setSettings(true);
                    }}
                  >
                    Open centre policy
                  </Button>
                )}
              </StaffMessage>
            )}
            {editing.id ? (
              <>
                <Select
                  label="Action"
                  value={action}
                  onChange={(e) =>
                    setAction(e.target.value as StorageAdjustInput['action'])
                  }
                >
                  <option value="contact">Record buyer contact</option>
                  <option value="assign">Assign follow-up</option>
                  {canAdjust && (
                    <>
                      <option value="extend">Extend deadline</option>
                      <option value="waive">Waive unpaid storage</option>
                    </>
                  )}
                </Select>
                {action === 'extend' && (
                  <Input
                    label="New collection date"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                )}
                {action === 'assign' && (
                  <Input
                    label="Staff account ID (empty to unassign)"
                    value={assignedToId}
                    onChange={(e) => setAssignedToId(e.target.value)}
                  />
                )}
              </>
            ) : (
              <p>
                This starts a fresh five-working-day grace period and sends the
                buyer a collection notice. Confirm the item is paid, physically
                ready and available at its centre.
              </p>
            )}
            <Input
              label="Reason / contact note"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={5}
              maxLength={500}
            />
            <Button
              busy={busy}
              disabled={reason.trim().length < 5}
              onClick={() => void save()}
            >
              Confirm change
            </Button>
          </div>
        )}
      </Dialog>
      <Dialog
        open={settings}
        onClose={() => setSettings(false)}
        title="Centre storage policy"
      >
        <StorageCentreSettings accessToken={accessToken} deviceId={deviceId} />
      </Dialog>
    </section>
  );
}
function StorageExceptions({
  accessToken,
  deviceId,
}: {
  accessToken: string;
  deviceId: string;
}) {
  const [data, setData] =
    useState<
      Awaited<
        ReturnType<ReturnType<typeof createPickupStorageClient>['exceptions']>
      >
    >();
  const [pages, setPages] = useState<(string | undefined)[]>([undefined]),
    [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const result = await createPickupStorageClient(
          process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
          { accessToken, deviceId },
        ).exceptions(pages.at(-1));
        if (active) {
          setData(result);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [accessToken, deviceId, pages]);
  return (
    <details className="lv-pickup-exceptions">
      <summary>Reconciliation & contact exceptions</summary>
      {error && (
        <StaffMessage onDismiss={() => setError(false)}>
          Exceptions could not be refreshed.
        </StaffMessage>
      )}
      {data?.items.map((item) => (
        <p key={item.id}>
          <strong>{item.itemReference}</strong> ·{' '}
          {item.kind.replaceAll('_', ' ')} · {item.status}
        </p>
      ))}
      {data && !data.items.length && (
        <p>No reconciliation exceptions on this page.</p>
      )}
      <WalletPagination
        page={pages.length}
        size={20}
        hasNext={!!data?.nextCursor}
        onPrevious={() => setPages((p) => (p.length > 1 ? p.slice(0, -1) : p))}
        onNext={() => {
          if (data?.nextCursor)
            setPages((p) => [...p, data.nextCursor ?? undefined]);
        }}
      />
    </details>
  );
}
