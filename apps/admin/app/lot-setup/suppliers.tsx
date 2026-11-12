'use client';
import {
  deleteConfirmation,
  useConfirm,
} from '@auction-ng/ui/admin/confirm-dialog';
import { useEffect, useState } from 'react';
import {
  formatNaira,
  supplierTypeLabels,
  supplierTypes,
  type SupplierRow,
} from '@auction-ng/shared';
import { Button } from '@auction-ng/ui/web/button';
import { Input } from '@auction-ng/ui/web/input';
import { Select } from '@auction-ng/ui/web/select';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Pencil, Search, Trash2 } from '@auction-ng/ui/web/icons';
import {
  describeFailure,
  downloadCsv,
  errorFor,
  useLoad,
  useSetupClient,
  type FieldErrors,
  type SetupContext,
} from './setup-data';
import type { TabActions } from './workspace';

type Draft = {
  name: string;
  type: (typeof supplierTypes)[number];
  contactName: string;
  phone: string;
  email: string;
  paymentTerms: string;
  notes: string;
};

export function SuppliersTab({
  ctx,
  register,
}: {
  ctx: SetupContext;
  register: (actions: TabActions) => void;
}) {
  const { confirm, dialog } = useConfirm();
  const client = useSetupClient(ctx);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState<string>();
  const [version, setVersion] = useState(0);
  const [rows, setRows] = useState<SupplierRow[]>([]);
  const page = useLoad(ctx, () => client.suppliers({ search: query, cursor }), [
    query,
    cursor,
    version,
  ]);
  const [editing, setEditing] = useState<SupplierRow | null>();
  const [toast, setToast] = useState('');
  const [problem, setProblem] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setCursor(undefined), [query, version]);
  useEffect(() => {
    if (page.data)
      setRows((r) => (cursor ? [...r, ...page.data!.items] : page.data!.items));
  }, [page.data]);
  useEffect(() => {
    register({
      create: () => setEditing(null),
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
            'Total spent',
            'Status',
          ],
          ...rows.map((s) => [
            s.name,
            supplierTypeLabels[s.type as Draft['type']] ?? s.type,
            s.contactName ?? '',
            s.phone ?? '',
            s.email ?? '',
            s.paymentTerms ?? '',
            s.batches,
            formatNaira(s.totalSpentKobo),
            s.active ? 'Active' : 'Inactive',
          ]),
        ]),
    });
  }, [register, rows]);
  const refresh = () => {
    setVersion((v) => v + 1);
    ctx.onChanged();
  };
  async function act(work: () => Promise<{ message: string }>) {
    setProblem('');
    try {
      setToast((await work()).message);
      refresh();
    } catch (failure) {
      setProblem(
        Object.values(describeFailure(failure, ctx))[0] ?? 'Not saved.',
      );
    }
  }
  return (
    <>
      {dialog}
      <div className="lv-setup-stack">
        {toast && (
          <p className="lv-setup-toast" role="status">
            {toast}
          </p>
        )}
        {problem && (
          <p className="lv-setup-alert" role="alert">
            {problem}
          </p>
        )}
        <section className="lv-setup-card lv-setup-card--flush">
          <div className="lv-setup-table-tools">
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
          </div>
          {page.loading && !page.data ? (
            <div
              className="lv-setup-skeleton lv-setup-skeleton--rows"
              aria-busy="true"
            />
          ) : page.error && !page.data ? (
            <div className="lv-setup-state" role="alert">
              <p>{page.error}</p>
              <Button variant="secondary" onClick={page.refresh}>
                Try again
              </Button>
            </div>
          ) : !rows.length ? (
            <div className="lv-setup-state">
              {query ? (
                <p>
                  No suppliers match “{query}”.{' '}
                  <button
                    type="button"
                    className="lv-setup-link"
                    onClick={() => setSearch('')}
                  >
                    Clear search
                  </button>
                </p>
              ) : (
                <>
                  <h2>No suppliers yet. Add the first one.</h2>
                  {ctx.canManage && (
                    <Button onClick={() => setEditing(null)}>
                      New supplier
                    </Button>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="lv-setup-scroll">
              <table className="lv-setup-table">
                <thead>
                  <tr>
                    <th scope="col">Supplier</th>
                    <th scope="col">Type</th>
                    <th scope="col">Contact</th>
                    <th scope="col">Payment terms</th>
                    <th scope="col" className="lv-setup-right">
                      Batches
                    </th>
                    <th scope="col" className="lv-setup-right">
                      Total spent
                    </th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.name}</strong>
                        {s.notes && <small>{s.notes}</small>}
                      </td>
                      <td>
                        {supplierTypeLabels[s.type as Draft['type']] ?? s.type}
                      </td>
                      <td>
                        {s.contactName ?? '—'}
                        {(s.phone || s.email) && (
                          <small>
                            {[s.phone, s.email].filter(Boolean).join(' · ')}
                          </small>
                        )}
                      </td>
                      <td>{s.paymentTerms ?? '—'}</td>
                      <td className="lv-setup-right">
                        {s.batches.toLocaleString('en-NG')}
                      </td>
                      <td className="lv-setup-right">
                        {formatNaira(s.totalSpentKobo)}
                      </td>
                      <td>
                        <span
                          className="lv-setup-pill"
                          data-tone={s.active ? 'green' : 'grey'}
                        >
                          {s.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="lv-setup-row-actions">
                        {ctx.canManage && (
                          <>
                            <button
                              type="button"
                              className="lv-setup-icon-button"
                              aria-label={`Edit ${s.name}`}
                              onClick={() => setEditing(s)}
                            >
                              <Pencil size={16} aria-hidden="true" />
                            </button>
                            <Button
                              variant="ghost"
                              size="small"
                              onClick={() =>
                                void act(() =>
                                  client.supplierActive({
                                    id: s.id,
                                    active: !s.active,
                                    expectedUpdatedAt: s.updatedAt,
                                  }),
                                )
                              }
                            >
                              {s.active ? 'Deactivate' : 'Activate'}
                            </Button>
                            <button
                              type="button"
                              className="lv-setup-icon-button lv-setup-icon-button--danger"
                              disabled={!s.deleteCheck.allowed}
                              title={
                                s.deleteCheck.allowed
                                  ? undefined
                                  : s.deleteCheck.reason
                              }
                              aria-label={
                                s.deleteCheck.allowed
                                  ? `Delete ${s.name}`
                                  : `${s.name} can't be deleted: ${s.deleteCheck.reason}`
                              }
                              onClick={async () => {
                                if (
                                  await confirm(
                                    deleteConfirmation('supplier', s.name),
                                  )
                                )
                                  void act(() =>
                                    client.deleteSupplier({
                                      id: s.id,
                                      expectedUpdatedAt: s.updatedAt,
                                    }),
                                  );
                              }}
                            >
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="lv-setup-table-foot">
            <p>
              Batches and total spent fill in once inventory batches are
              recorded. A supplier with batches can be deactivated but not
              deleted.
            </p>
            {page.data?.nextCursor && (
              <Button
                variant="secondary"
                size="small"
                onClick={() => setCursor(page.data?.nextCursor ?? undefined)}
              >
                Show more
              </Button>
            )}
          </div>
        </section>
        {editing !== undefined && (
          <SupplierDialog
            ctx={ctx}
            supplier={editing ?? undefined}
            onClose={() => setEditing(undefined)}
            onSaved={(message) => {
              setEditing(undefined);
              setToast(message);
              refresh();
            }}
          />
        )}
      </div>
    </>
  );
}

function SupplierDialog({
  ctx,
  supplier,
  onClose,
  onSaved,
}: {
  ctx: SetupContext;
  supplier?: SupplierRow;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const client = useSetupClient(ctx);
  const [draft, setDraft] = useState<Draft>({
    name: supplier?.name ?? '',
    type: (supplier?.type as Draft['type']) ?? 'marketplace_returns',
    contactName: supplier?.contactName ?? '',
    phone: supplier?.phone ?? '',
    email: supplier?.email ?? '',
    paymentTerms: supplier?.paymentTerms ?? '',
    notes: supplier?.notes ?? '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  return (
    <Dialog
      open
      title={supplier ? `Edit ${supplier.name}` : 'New supplier'}
      onClose={onClose}
    >
      <form
        className="lv-setup-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErrors({});
          try {
            const result = await client.saveSupplier({
              ...(supplier
                ? { id: supplier.id, expectedUpdatedAt: supplier.updatedAt }
                : {}),
              ...draft,
            });
            onSaved(result.message);
          } catch (failure) {
            setErrors(describeFailure(failure, ctx));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input
          label="Name"
          value={draft.name}
          maxLength={120}
          error={errorFor(errors, 'name')}
          onChange={(e) => set('name', e.target.value)}
          autoFocus
        />
        <Select
          label="Type"
          value={draft.type}
          onChange={(e) => set('type', e.target.value as Draft['type'])}
        >
          {supplierTypes.map((t) => (
            <option key={t} value={t}>
              {supplierTypeLabels[t]}
            </option>
          ))}
        </Select>
        <div className="lv-setup-grid lv-setup-grid--2">
          <Input
            label="Contact person"
            value={draft.contactName}
            maxLength={120}
            error={errorFor(errors, 'contactName')}
            onChange={(e) => set('contactName', e.target.value)}
          />
          <Input
            label="Phone"
            value={draft.phone}
            inputMode="tel"
            maxLength={20}
            error={errorFor(errors, 'phone')}
            onChange={(e) => set('phone', e.target.value)}
          />
          <Input
            label="Email"
            value={draft.email}
            type="email"
            maxLength={200}
            error={errorFor(errors, 'email')}
            onChange={(e) => set('email', e.target.value)}
          />
          <Input
            label="Payment terms"
            value={draft.paymentTerms}
            maxLength={120}
            placeholder="e.g. Net 14 days"
            error={errorFor(errors, 'paymentTerms')}
            onChange={(e) => set('paymentTerms', e.target.value)}
          />
        </div>
        <Input
          label="Notes (optional)"
          value={draft.notes}
          maxLength={1000}
          error={errorFor(errors, 'notes')}
          onChange={(e) => set('notes', e.target.value)}
        />
        {errors.form && <p className="lv-setup-error">{errors.form}</p>}
        <div className="lv-setup-actions lv-setup-actions--end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            {supplier ? 'Save supplier' : 'Add supplier'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
