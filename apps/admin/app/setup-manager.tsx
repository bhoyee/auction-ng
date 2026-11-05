'use client';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@auction-ng/api-client/auth';
import type { createStaffAdminClient } from '@auction-ng/api-client/staff-admin';
import {
  type StaffSetupRow,
  type StaffSetupSave,
  staffSetupSaveSchema,
} from '@auction-ng/shared';
import { Button } from '@auction-ng/ui/web/button';
import { Input } from '@auction-ng/ui/web/input';
import { Dialog } from '@auction-ng/ui/web/dialog';
import {
  StaffBadge,
  StaffMessage,
  StaffSearch,
} from '@auction-ng/ui/web/staff-dashboard-view';
type Client = ReturnType<typeof createStaffAdminClient>;
type Page = Awaited<ReturnType<Client['setup']>>;
export function SetupManager({
  client,
  kind,
  online,
  canPurge,
}: {
  client: Client;
  kind: 'category' | 'location';
  online: boolean;
  canPurge: boolean;
}) {
  const [view, setView] = useState<'active' | 'archived'>('active'),
    [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [cursor, setCursor] = useState<string>(),
    [pages, setPages] = useState<(string | undefined)[]>([]),
    [data, setData] = useState<Page>(),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [edit, setEdit] = useState<StaffSetupRow | null | undefined>(),
    [operation, setOperation] = useState<{
      row: StaffSetupRow;
      action: 'archive' | 'restore' | 'purge';
    }>();
  useEffect(() => {
    const t = setTimeout(() => {
      if (search === query) return;
      setData(undefined);
      setQuery(search);
      setCursor(undefined);
      setPages([]);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    let active = true,
      running = false;
    async function read() {
      if (running || document.hidden || !navigator.onLine) return;
      running = true;
      try {
        const result = await client.setup({
          kind,
          view,
          search: query || undefined,
          cursor,
        });
        if (active) {
          setData(result);
          setError('');
        }
      } catch (e) {
        if (active) {
          setError(
            'Records could not be refreshed. Check your connection and retry.',
          );
          if (e instanceof ApiError && [401, 403].includes(e.status))
            setData(undefined);
        }
      } finally {
        running = false;
      }
    }
    void read();
    const t = setInterval(() => void read(), 5000);
    window.addEventListener('lotvanta:staff-refresh', read);
    window.addEventListener('online', read);
    return () => {
      active = false;
      clearInterval(t);
      window.removeEventListener('lotvanta:staff-refresh', read);
      window.removeEventListener('online', read);
    };
  }, [client, kind, view, query, cursor, revision]);
  const refresh = () => {
    setRevision((v) => v + 1);
    window.dispatchEvent(new Event('lotvanta:staff-refresh'));
  };
  return (
    <section className="lv-staff-setup">
      <div className="lv-staff-toolbar">
        <div
          className="lv-staff-setup-filter"
          role="group"
          aria-label="Record status"
        >
          {(['active', 'archived'] as const).map((v) => (
            <Button
              key={v}
              aria-pressed={view === v}
              variant={view === v ? 'primary' : 'secondary'}
              onClick={() => {
                setData(undefined);
                setView(v);
                setCursor(undefined);
                setPages([]);
              }}
            >
              {v === 'active' ? 'Active' : 'Archived'}
            </Button>
          ))}
        </div>
        <Button disabled={!online} onClick={() => setEdit(null)}>
          Add {kind === 'category' ? 'category' : 'pickup centre'}
        </Button>
      </div>
      <StaffSearch
        value={search}
        onChange={setSearch}
        onSubmit={() => {
          setQuery(search);
          setCursor(undefined);
          setPages([]);
        }}
        placeholder={
          kind === 'category'
            ? 'Search category name'
            : 'Search pickup centre name'
        }
      />
      {error && (
        <StaffMessage>
          {error}
          <Button size="small" onClick={refresh}>
            Retry
          </Button>
        </StaffMessage>
      )}
      {message && <StaffMessage tone="success">{message}</StaffMessage>}
      {!data && !error ? (
        <p role="status">Loading records…</p>
      ) : data?.items.length === 0 ? (
        <div className="lv-staff-panel lv-staff-empty">
          <h3>
            No matching {kind === 'category' ? 'categories' : 'pickup centres'}
          </h3>
          <p>Add a record or adjust your search.</p>
        </div>
      ) : (
        <div className="lv-staff-setup-list">
          {data?.items.map((row) => (
            <article className="lv-staff-panel lv-staff-setup-row" key={row.id}>
              <div>
                <h3>{row.name}</h3>
                <small>{row.key}</small>
                <p>
                  {kind === 'location'
                    ? row.address
                    : row.linkedLots + ' linked items'}
                </p>
                {kind === 'location' && <small>{row.hours}</small>}
                {kind === 'location' && (
                  <>
                    <dl className="lv-staff-centre-counts">
                      <div>
                        <dt>Items at centre</dt>
                        <dd>
                          {row.currentItems?.toLocaleString('en-NG') ?? '—'}
                        </dd>
                      </div>
                      <div>
                        <dt>Pending pickup</dt>
                        <dd>
                          {row.pendingPickupItems?.toLocaleString('en-NG') ??
                            '—'}
                        </dd>
                      </div>
                    </dl>
                    <small>Totals update automatically</small>
                  </>
                )}
              </div>
              <div>
                <StaffBadge status={row.archivedAt ? 'archived' : 'active'} />
                <small>
                  {kind === 'location' ? 'Details updated' : 'Updated'}{' '}
                  {new Date(row.updatedAt).toLocaleString('en-NG', {
                    timeZone: 'Africa/Lagos',
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}{' '}
                  WAT
                </small>
              </div>
              <div className="lv-staff-row-actions">
                {view === 'active' ? (
                  <>
                    <Button
                      size="small"
                      disabled={!online}
                      onClick={() => setEdit(row)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="small"
                      variant="danger"
                      disabled={!online}
                      onClick={() => setOperation({ row, action: 'archive' })}
                    >
                      Archive
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="small"
                      disabled={!online}
                      onClick={() => setOperation({ row, action: 'restore' })}
                    >
                      Restore
                    </Button>
                    {canPurge && (
                      <Button
                        size="small"
                        variant="danger"
                        disabled={!online || row.linkedLots > 0}
                        onClick={() => setOperation({ row, action: 'purge' })}
                      >
                        Delete permanently
                      </Button>
                    )}
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="lv-staff-pagination">
        <Button
          variant="secondary"
          disabled={!pages.length || !online}
          onClick={() => {
            setCursor(pages.at(-1));
            setPages((v) => v.slice(0, -1));
          }}
        >
          Previous
        </Button>
        <span>Page {pages.length + 1}</span>
        <Button
          disabled={!data?.nextCursor || !online}
          onClick={() => {
            setPages((v) => [...v, cursor]);
            setCursor(data?.nextCursor ?? undefined);
          }}
        >
          Next
        </Button>
      </div>
      {edit !== undefined && (
        <Dialog
          open
          title={
            edit
              ? 'Edit ' + (kind === 'category' ? 'category' : 'pickup centre')
              : 'Add ' + (kind === 'category' ? 'category' : 'pickup centre')
          }
          onClose={() => setEdit(undefined)}
        >
          <SetupForm
            client={client}
            kind={kind}
            row={edit}
            online={online}
            onSaved={(text) => {
              setEdit(undefined);
              setMessage(text);
              refresh();
            }}
          />
        </Dialog>
      )}
      {operation && (
        <Dialog
          open
          title={
            operation.action === 'purge'
              ? 'Delete unused record permanently?'
              : operation.action === 'archive'
                ? 'Archive this record?'
                : 'Restore this record?'
          }
          onClose={() => setOperation(undefined)}
        >
          <SetupOperation
            client={client}
            operation={operation}
            online={online}
            onSaved={(text) => {
              setOperation(undefined);
              setMessage(text);
              refresh();
            }}
          />
        </Dialog>
      )}
    </section>
  );
}
function SetupForm({
  client,
  kind,
  row,
  online,
  onSaved,
}: {
  client: Client;
  kind: 'category' | 'location';
  row: StaffSetupRow | null;
  online: boolean;
  onSaved: (s: string) => void;
}) {
  const [name, setName] = useState(row?.name ?? ''),
    [key, setKey] = useState(row?.key ?? ''),
    [address, setAddress] = useState(row?.address ?? ''),
    [hours, setHours] = useState(row?.hours ?? ''),
    [capacity, setCapacity] = useState(String(row?.capacityPerSlot ?? 20)),
    [reason, setReason] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [locked, setLocked] = useState(false);
  const id = useRef(crypto.randomUUID()),
    pending = useRef<StaffSetupSave | undefined>(undefined),
    alert = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) alert.current?.scrollIntoView({ block: 'nearest' });
  }, [error]);
  async function save() {
    setBusy(true);
    setError('');
    try {
      const common = {
        idempotencyKey: id.current,
        reason,
        id: row?.id,
        expectedUpdatedAt: row?.updatedAt,
        name,
      };
      const v: StaffSetupSave =
        pending.current ??
        (kind === 'category'
          ? { ...common, kind, slug: key, parentId: row?.parentId ?? null }
          : {
              ...common,
              kind,
              code: key,
              address,
              hours,
              capacityPerSlot: Number(capacity),
            });
      const checked = staffSetupSaveSchema.safeParse(v);
      if (!checked.success) {
        setError(
          'Check the name, identifier and required fields, then try again.',
        );
        return;
      }
      pending.current = checked.data;
      const result = await client.saveSetup(checked.data);
      onSaved(result.message);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? 'This record changed, its identifier is already used, or it is protected. Close and reload before trying again.'
          : 'Changes could not be confirmed. Check the fields and connection, then retry.',
      );
      if (
        e instanceof ApiError &&
        [400, 401, 403, 404, 409, 429].includes(e.status)
      ) {
        pending.current = undefined;
        id.current = crypto.randomUUID();
      } else setLocked(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="lv-staff-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {error && (
        <div ref={alert}>
          <StaffMessage>{error}</StaffMessage>
        </div>
      )}
      <Input
        label="Name"
        value={name}
        required
        minLength={2}
        maxLength={100}
        disabled={busy || locked}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        label={
          kind === 'category'
            ? 'URL slug (for example phones)'
            : 'Centre code (for example LAGOS-01)'
        }
        value={key}
        required
        maxLength={kind === 'category' ? 120 : 32}
        pattern={
          kind === 'category'
            ? '[a-z0-9]+(-[a-z0-9]+)*'
            : '[A-Z0-9]+(-[A-Z0-9]+)*'
        }
        disabled={busy || locked}
        onChange={(e) => setKey(e.target.value)}
      />
      {kind === 'location' && (
        <>
          <label>
            Pickup address
            <textarea
              value={address}
              required
              minLength={5}
              maxLength={1000}
              disabled={busy || locked}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          <Input
            label="Opening hours (WAT)"
            placeholder="Monday–Friday, 9am–5pm"
            value={hours}
            required
            minLength={2}
            maxLength={1000}
            disabled={busy || locked}
            onChange={(e) => setHours(e.target.value)}
          />
          <Input
            label="Buyers per time window (future booking)"
            aria-describedby="pickup-capacity-help"
            type="number"
            value={capacity}
            min={1}
            max={10000}
            step={1}
            required
            disabled={busy || locked}
            onChange={(e) => setCapacity(e.target.value)}
          />
          <p className="lv-staff-hint" id="pickup-capacity-help">
            For example, 20 buyers in one collection window. Scheduled pickup
            booking is not enabled yet; this does not limit check-in today.
          </p>
        </>
      )}
      <Input
        label="Reason for this change"
        value={reason}
        required
        minLength={5}
        maxLength={1000}
        disabled={busy || locked}
        onChange={(e) => setReason(e.target.value)}
      />
      <Button type="submit" disabled={busy || !online}>
        {busy
          ? 'Saving…'
          : locked
            ? 'Retry same change'
            : 'Save ' + (kind === 'category' ? 'category' : 'pickup centre')}
      </Button>
    </form>
  );
}
function SetupOperation({
  client,
  operation,
  online,
  onSaved,
}: {
  client: Client;
  operation: { row: StaffSetupRow; action: 'archive' | 'restore' | 'purge' };
  online: boolean;
  onSaved: (s: string) => void;
}) {
  const [reason, setReason] = useState(''),
    [confirm, setConfirm] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const key = useRef(crypto.randomUUID());
  async function submit() {
    setBusy(true);
    setError('');
    try {
      const v = operation.row;
      const result = await client.archiveSetup({
        kind: v.kind,
        id: v.id,
        expectedUpdatedAt: v.updatedAt,
        operation: operation.action,
        idempotencyKey: key.current,
        reason,
      });
      onSaved(result.message);
    } catch {
      setError(
        'This record could not be changed. Ongoing auctions, linked history or pending collections may protect it. Close and reload before retrying.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="lv-staff-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {error && <StaffMessage>{error}</StaffMessage>}
      <strong>{operation.row.name}</strong>
      <p>
        {operation.action === 'purge'
          ? 'Only an unused archived record can be permanently deleted. Linked auction and collection history is retained.'
          : operation.action === 'archive'
            ? 'Archived records leave new-item selectors. Ongoing auctions and outstanding collections must be completed first.'
            : 'This record will be available for new items again.'}
      </p>
      <Input
        label="Reason"
        value={reason}
        minLength={5}
        maxLength={1000}
        required
        disabled={busy}
        onChange={(e) => setReason(e.target.value)}
      />
      {operation.action === 'purge' && (
        <Input
          label="Type DELETE to confirm"
          value={confirm}
          required
          pattern="DELETE"
          onChange={(e) => setConfirm(e.target.value)}
        />
      )}
      <Button
        type="submit"
        variant={operation.action === 'restore' ? 'primary' : 'danger'}
        disabled={busy || !online}
      >
        {busy
          ? 'Saving…'
          : operation.action === 'purge'
            ? 'Delete permanently'
            : operation.action === 'archive'
              ? 'Archive record'
              : 'Restore record'}
      </Button>
    </form>
  );
}
