'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  supplierTypeLabels,
  type SupplierBatches,
  type SupplierRow,
  type supplierTypes,
} from '@auction-ng/shared';
import {
  deleteConfirmation,
  useConfirm,
} from '@auction-ng/ui/admin/confirm-dialog';
import { Button } from '@auction-ng/ui/web/button';
import { Plus, Search, Trash2 } from '@auction-ng/ui/web/icons';
import { openStaffPage } from '../batches/batches-area';
import {
  BatchStatusPill,
  GotBack,
  shortDay,
  shortNaira,
} from '../batches/batch-ui';
import {
  emptySupplier,
  supplierDraft,
  SupplierFields,
  supplierInput,
  type SupplierDraft,
} from '../batches/supplier-fields';
import { SETUP_PAGE_SIZE, SetupPager, useKeysetPager } from './pager';
import {
  describeFailure,
  downloadCsv,
  useLoad,
  useSetupClient,
  type FieldErrors,
  type SetupContext,
} from './setup-data';
import type { TabActions } from './workspace';

const typeLabel = (type: string) =>
  supplierTypeLabels[type as (typeof supplierTypes)[number]] ?? type;
const initials = (name: string) =>
  name
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
const batchesText = (n: number) =>
  `${n.toLocaleString('en-NG')} ${n === 1 ? 'batch' : 'batches'}`;
const since = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Lagos',
  month: 'short',
  year: 'numeric',
});

/** Lot setup › Suppliers: cards on the left, the chosen supplier on the right. */
export function SuppliersTab({
  ctx,
  selected,
  onSelect,
  register,
}: {
  ctx: SetupContext;
  selected: string;
  onSelect: (id: string) => void;
  register: (actions: TabActions) => void;
}) {
  const client = useSetupClient(ctx);
  const { confirm, dialog } = useConfirm();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [version, setVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState('');
  const dirty = useRef(false);
  const pager = useKeysetPager();
  const page = useLoad(
    ctx,
    () =>
      client.suppliers({
        search: query,
        cursor: pager.cursor,
        limit: SETUP_PAGE_SIZE,
      }),
    [query, pager.cursor, version],
    true,
  );
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  const { reset } = pager;
  useEffect(() => reset(), [query, reset]);
  const rows = useMemo(() => page.data?.items ?? [], [page.data]);
  const current = creating
    ? undefined
    : (rows.find((s) => s.id === selected) ?? rows[0]);
  /** Asks before unsaved changes are lost. */
  const leave = async () =>
    !dirty.current ||
    (await confirm({
      title: 'Leave without saving?',
      message: 'Your changes to this supplier will be lost.',
      confirmLabel: 'Leave',
      tone: 'danger',
    }));
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  useEffect(() => {
    register({
      create: () =>
        void leaveRef.current().then((yes) => {
          if (!yes) return;
          dirty.current = false;
          setToast('');
          setCreating(true);
        }),
      exportCsv: () =>
        downloadCsv('suppliers.csv', [
          [
            'Supplier',
            'Type',
            'Contact',
            'Phone',
            'Email',
            'Payment terms',
            'Batches',
            'Total spent (NGN)',
            'Got back %',
            'Status',
          ],
          ...rows.map((s) => [
            s.name,
            typeLabel(s.type),
            s.contactName ?? '',
            s.phone ?? '',
            s.email ?? '',
            s.paymentTerms ?? '',
            s.batches,
            s.totalSpentKobo === null
              ? ''
              : (s.totalSpentKobo / 100).toFixed(2),
            s.gotBackPercent ?? '',
            s.active ? 'Active' : 'Paused',
          ]),
        ]),
    });
  }, [register, rows]);
  const changed = (message: string, id?: string) => {
    dirty.current = false;
    setToast(message);
    setCreating(false);
    if (id) onSelect(id);
    setVersion((v) => v + 1);
    ctx.onChanged();
  };
  if (page.forbidden)
    return (
      <div className="lv-setup-state">
        <p>Your role can’t see suppliers. Ask an admin.</p>
      </div>
    );
  if (!page.data)
    return page.error ? (
      <div className="lv-setup-state" role="alert">
        <p>{page.error}</p>
        <Button variant="secondary" onClick={page.refresh}>
          Try again
        </Button>
      </div>
    ) : (
      <div className="lv-setup-skeleton lv-setup-skeleton--tall" aria-busy />
    );
  const data = page.data;
  return (
    <>
      {dialog}
      <div className="lv-setup-split lv-supplier-split">
        <div className="lv-supplier-list">
          <label className="lv-setup-search">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Search suppliers</span>
            <input
              type="search"
              placeholder="Search suppliers"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div
            className="lv-supplier-scroll"
            role="region"
            aria-label="Supplier list"
            tabIndex={0}
          >
            {rows.map((s) => (
              <button
                key={s.id}
                type="button"
                className="lv-supplier-card"
                aria-current={s.id === current?.id ? 'true' : undefined}
                onClick={async () => {
                  if (s.id === current?.id || !(await leave())) return;
                  dirty.current = false;
                  setToast('');
                  setCreating(false);
                  onSelect(s.id);
                }}
              >
                <span className="lv-supplier-initials" aria-hidden="true">
                  {initials(s.name)}
                </span>
                <span className="lv-supplier-name">
                  <b>{s.name}</b>
                  <small>
                    {typeLabel(s.type)} · {s.contactName ?? '—'}
                  </small>
                </span>
                <StatusPill active={s.active} />
                <span className="lv-supplier-numbers">
                  <span>
                    <small>Bought</small>
                    <b>{batchesText(s.batches)}</b>
                  </span>
                  {s.totalSpentKobo !== null && (
                    <>
                      <span>
                        <small>Total spent</small>
                        <b>{shortNaira(s.totalSpentKobo)}</b>
                      </span>
                      <span>
                        <small>Got back</small>
                        <GotBack percent={s.gotBackPercent} />
                      </span>
                    </>
                  )}
                </span>
              </button>
            ))}
          </div>
          {!rows.length && (
            <div className="lv-setup-state">
              {query ? (
                <p>No suppliers match “{query}”.</p>
              ) : (
                <p>No suppliers yet. Add the first one.</p>
              )}
            </div>
          )}
          <SetupPager
            label="Suppliers"
            page={pager.page}
            count={rows.length}
            nextCursor={data.nextCursor}
            onPrev={pager.prev}
            onNext={pager.next}
          />
          <p className="lv-setup-muted lv-batch-note">
            “Got back” = money from sold lots ÷ what you paid, for batches that
            have started selling. Over 100% means the supplier’s stock made
            money.
          </p>
        </div>
        <div className="lv-setup-stack">
          {toast && (
            <p className="lv-setup-toast" role="status">
              {toast}
            </p>
          )}
          {creating ? (
            <SupplierDetails
              key="new"
              ctx={ctx}
              categories={data.categories}
              canSeeBank={data.canSeeBank}
              onDirty={(v) => (dirty.current = v)}
              onDiscard={() => {
                dirty.current = false;
                setCreating(false);
              }}
              onSaved={changed}
            />
          ) : current ? (
            <>
              <SupplierSummary supplier={current} />
              <SupplierBatchTable
                key={`batches-${current.id}`}
                ctx={ctx}
                supplier={current}
                canAddBatch={data.canAddBatch}
              />
              <SupplierDetails
                key={current.id}
                ctx={ctx}
                supplier={current}
                categories={data.categories}
                canSeeBank={data.canSeeBank}
                onDirty={(v) => (dirty.current = v)}
                onSaved={changed}
                onDelete={async () => {
                  if (
                    !(await confirm(
                      deleteConfirmation('supplier', current.name),
                    ))
                  )
                    return;
                  const result = await client.deleteSupplier({
                    id: current.id,
                    expectedUpdatedAt: current.updatedAt,
                  });
                  onSelect('');
                  changed(result.message);
                }}
              />
            </>
          ) : (
            <div className="lv-setup-card lv-setup-state">
              <h2>Who do you buy stock from?</h2>
              {ctx.canManage && (
                <Button onClick={() => setCreating(true)}>New supplier</Button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span className="lv-setup-pill" data-tone={active ? 'green' : 'grey'}>
      {active ? 'Active' : 'Paused'}
    </span>
  );
}

function SupplierSummary({ supplier: s }: { supplier: SupplierRow }) {
  return (
    <section className="lv-setup-card lv-supplier-summary">
      <span className="lv-supplier-initials" data-large="" aria-hidden="true">
        {initials(s.name)}
      </span>
      <div>
        <h2>
          {s.name} <StatusPill active={s.active} />
        </h2>
        <p>
          {typeLabel(s.type)} · supplier since{' '}
          {since.format(new Date(s.createdAt))}
          {s.addedBy && ` · added by ${s.addedBy}`}
        </p>
      </div>
      {s.totalSpentKobo !== null && (
        <dl>
          <div>
            <dt>Total spent</dt>
            <dd>{shortNaira(s.totalSpentKobo)}</dd>
          </div>
          <div>
            <dt>Got back</dt>
            <dd>
              <GotBack percent={s.gotBackPercent} />
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}

function SupplierBatchTable({
  ctx,
  supplier,
  canAddBatch,
}: {
  ctx: SetupContext;
  supplier: SupplierRow;
  canAddBatch: boolean;
}) {
  const client = useSetupClient(ctx);
  const pager = useKeysetPager();
  const page = useLoad<SupplierBatches>(
    ctx,
    () => client.supplierBatches(supplier.id, pager.cursor),
    [supplier.id, pager.cursor],
    true,
  );
  const rows = page.data?.items ?? [];
  const money = rows.some((b) => b.costKobo !== null);
  return (
    <section className="lv-setup-card lv-setup-card--flush">
      <div className="lv-batch-card-head">
        <div>
          <h2>Batches from this supplier</h2>
          <p>
            {supplier.batches
              ? `Latest ${rows.length} of ${supplier.batches} ${supplier.batches === 1 ? 'purchase' : 'purchases'}. Click one to open it.`
              : 'Nothing bought yet.'}
          </p>
        </div>
        {canAddBatch && (
          <Button
            size="small"
            disabled={!supplier.active}
            title={
              supplier.active
                ? undefined
                : 'Paused suppliers can’t be bought from'
            }
            onClick={() =>
              openStaffPage('batches', `/batches/new?supplier=${supplier.id}`)
            }
          >
            <Plus size={16} aria-hidden="true" /> Add batch
          </Button>
        )}
      </div>
      {!page.data ? (
        page.error ? (
          <div className="lv-setup-state" role="alert">
            <p>{page.error}</p>
            <Button variant="secondary" onClick={page.refresh}>
              Try again
            </Button>
          </div>
        ) : (
          <div
            className="lv-setup-skeleton lv-setup-skeleton--rows"
            aria-busy="true"
          />
        )
      ) : rows.length > 0 ? (
        <div className="lv-setup-scroll">
          <table className="lv-setup-table">
            <thead>
              <tr>
                <th scope="col">Batch</th>
                <th scope="col">Received</th>
                {money && (
                  <th scope="col" className="lv-setup-right">
                    Cost
                  </th>
                )}
                <th scope="col" className="lv-setup-right">
                  Items
                </th>
                <th scope="col" className="lv-setup-right">
                  Sold
                </th>
                {money && (
                  <>
                    <th scope="col" className="lv-setup-right">
                      Money back
                    </th>
                    <th scope="col" className="lv-setup-right">
                      Got back
                    </th>
                  </>
                )}
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const started = ['selling', 'closed'].includes(b.status);
                return (
                  <tr key={b.id}>
                    <td>
                      <button
                        type="button"
                        className="lv-setup-link"
                        onClick={() =>
                          openStaffPage('batches', `/batches/${b.id}`)
                        }
                      >
                        {b.code}
                      </button>
                      <small>{b.name}</small>
                    </td>
                    <td className="lv-batch-nowrap">
                      {b.receivedOn
                        ? shortDay(b.receivedOn)
                        : b.expectedOn
                          ? `due ${shortDay(b.expectedOn)}`
                          : '—'}
                    </td>
                    {money && (
                      <td className="lv-setup-right">
                        {shortNaira(b.costKobo ?? 0)}
                      </td>
                    )}
                    <td className="lv-setup-right">
                      {b.itemsReceived === null ? '~' : ''}
                      {(b.itemsReceived ?? b.itemsExpected).toLocaleString(
                        'en-NG',
                      )}
                    </td>
                    <td className="lv-setup-right">
                      {started ? `${b.soldPercent}%` : '—'}
                    </td>
                    {money && (
                      <>
                        <td className="lv-setup-right">
                          {started ? shortNaira(b.moneyBackKobo ?? 0) : '—'}
                        </td>
                        <td className="lv-setup-right">
                          <GotBack
                            percent={started ? b.recoveryPercent : null}
                          />
                        </td>
                      </>
                    )}
                    <td>
                      <BatchStatusPill status={b.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      <SetupPager
        label="Supplier batches"
        page={pager.page}
        count={rows.length}
        nextCursor={page.data?.nextCursor}
        onPrev={pager.prev}
        onNext={pager.next}
      />
    </section>
  );
}

function SupplierDetails({
  ctx,
  supplier,
  categories,
  canSeeBank,
  onDirty,
  onDiscard,
  onSaved,
  onDelete,
}: {
  ctx: SetupContext;
  supplier?: SupplierRow;
  categories: { id: string; name: string }[];
  canSeeBank: boolean;
  onDirty: (dirty: boolean) => void;
  /** New suppliers only: close the form. */
  onDiscard?: () => void;
  onSaved: (message: string, id?: string) => void;
  onDelete?: () => Promise<void>;
}) {
  const client = useSetupClient(ctx);
  const [draft, setDraft] = useState<SupplierDraft>(() =>
    supplier ? supplierDraft(supplier) : emptySupplier(),
  );
  const [dirty, setDirty] = useState(false);
  // The version being edited. A silent refresh never replaces what someone
  // is typing, and saving over a newer version is refused.
  const [version, setVersion] = useState(supplier?.updatedAt);
  useEffect(() => {
    if (!supplier || dirty || supplier.updatedAt === version) return;
    setDraft(supplierDraft(supplier));
    setVersion(supplier.updatedAt);
  }, [supplier, dirty, version]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setErrors({});
    try {
      await work();
    } catch (failure) {
      setErrors(describeFailure(failure, ctx));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="lv-setup-stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          const result = await client.saveSupplier({
            ...(supplier
              ? { id: supplier.id, expectedUpdatedAt: version }
              : {}),
            ...supplierInput(draft, canSeeBank),
            idempotencyKey: key.current,
          });
          setDirty(false);
          onSaved(result.message, result.id);
        });
      }}
    >
      <section className="lv-setup-card">
        <h2>{supplier ? 'Details' : 'New supplier'}</h2>
        <SupplierFields
          draft={draft}
          errors={errors}
          canSeeBank={canSeeBank}
          categories={categories}
          disabled={!ctx.canManage || busy}
          onChange={(next) => {
            setDraft(next);
            setDirty(true);
            onDirty(true);
            setErrors({});
            key.current = crypto.randomUUID();
          }}
        />
      </section>
      {errors.form && (
        <p className="lv-setup-alert" role="alert">
          {errors.form}
        </p>
      )}
      {ctx.canManage && (
        <div className="lv-supplier-actions">
          <p className="lv-setup-muted">
            {supplier && !supplier.deleteCheck.allowed
              ? 'Suppliers with batches can’t be deleted; pause them instead.'
              : ''}
          </p>
          {supplier && onDelete && supplier.deleteCheck.allowed && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void run(onDelete)}
            >
              <Trash2 size={16} aria-hidden="true" /> Delete
            </Button>
          )}
          {supplier && (
            <Button
              variant="secondary"
              disabled={busy || !ctx.online}
              onClick={() =>
                void run(async () => {
                  const result = await client.supplierActive({
                    id: supplier.id,
                    active: !supplier.active,
                    expectedUpdatedAt: supplier.updatedAt,
                  });
                  onSaved(result.message, supplier.id);
                })
              }
            >
              {supplier.active ? 'Pause supplier' : 'Make active'}
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={busy || (!!supplier && !dirty)}
            onClick={() => {
              setDirty(false);
              onDirty(false);
              setErrors({});
              if (supplier) {
                setDraft(supplierDraft(supplier));
                setVersion(supplier.updatedAt);
              } else onDiscard?.();
            }}
          >
            Discard
          </Button>
          <Button type="submit" busy={busy} disabled={!dirty || !ctx.online}>
            {supplier ? 'Save changes' : 'Add supplier'}
          </Button>
        </div>
      )}
    </form>
  );
}
