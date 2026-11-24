'use client';
import { useEffect, useRef, useState } from 'react';
import {
  batchSaveSchema,
  batchTotalCostKobo,
  formatNaira,
  paidFromAccounts,
  paidFromLabels,
  type BatchDetail,
  type CostShareMethod,
} from '@auction-ng/shared';
import type { BatchesClient } from '@auction-ng/api-client/batches';
import type { LotSetupClient } from '@auction-ng/api-client/lot-setup';
import { Button } from '@auction-ng/ui/web/button';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Input } from '@auction-ng/ui/web/input';
import { NairaInput } from '@auction-ng/ui/web/naira-input';
import { Select } from '@auction-ng/ui/web/select';
import { Textarea } from '@auction-ng/ui/web/textarea';
import { Check, X } from '@auction-ng/ui/web/icons';
import { useConfirm } from '@auction-ng/ui/admin/confirm-dialog';
import { openStaffPage } from './batches-area';
import { FilePicker, uploadFiles } from './batch-files';
import {
  emptySupplier,
  SupplierFields,
  supplierInput,
  type SupplierDraft,
} from './supplier-fields';
import {
  fieldErrors,
  LoadState,
  shortNaira,
  todayWat,
  useBatchLoad,
} from './batch-ui';

type Draft = {
  supplierId: string;
  name: string;
  supplierRef: string;
  boughtOn: string;
  locationId: string;
  status: 'arriving' | 'received';
  expectedOn: string;
  itemsExpected: string;
  categoryIds: string[];
  costSupplierKobo?: number;
  costTransportKobo?: number;
  costCustomsKobo?: number;
  costOtherKobo?: number;
  costShareMethod: CostShareMethod;
  paidFrom: '' | (typeof paidFromAccounts)[number];
  notes: string;
};
const costRows = [
  ['costSupplierKobo', 'What you paid the supplier', ''],
  ['costTransportKobo', 'Transport to the hub', ''],
  ['costCustomsKobo', 'Customs or clearing', 'For overseas pallets'],
  ['costOtherKobo', 'Other (loaders, packaging)', ''],
] as const;

export function BatchForm({
  id,
  client,
  setup,
  online,
  canSeeBank,
  go,
}: {
  id: string | null;
  client: BatchesClient;
  setup: LotSetupClient;
  online: boolean;
  canSeeBank: boolean;
  go: (path: string) => void;
}) {
  const options = useBatchLoad(() => client.form(), [client]);
  const [loaded, setLoaded] = useState<BatchDetail>();
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!id) return;
    let active = true;
    client
      .detail(id)
      .then((d) => active && setLoaded(d))
      .catch(() => active && setLoadError('This batch couldn’t be loaded.'));
    return () => {
      active = false;
    };
  }, [client, id, attempt]);
  if (!options.data || (id && !loaded))
    return (
      <LoadState
        error={options.error || loadError}
        onRetry={() => {
          setLoadError('');
          options.reload();
          setAttempt((a) => a + 1);
        }}
      />
    );
  return (
    <Form
      detail={loaded}
      options={options.data}
      reloadOptions={options.reload}
      {...{ client, setup, online, canSeeBank, go }}
    />
  );
}

function Form({
  detail,
  options,
  reloadOptions,
  client,
  setup,
  online,
  canSeeBank,
  go,
}: {
  detail?: BatchDetail;
  options: Awaited<ReturnType<BatchesClient['form']>>;
  reloadOptions: () => void;
  client: BatchesClient;
  setup: LotSetupClient;
  online: boolean;
  canSeeBank: boolean;
  go: (path: string) => void;
}) {
  const { confirm, dialog } = useConfirm();
  const batch = detail?.batch;
  const [draft, setDraft] = useState<Draft>(() => ({
    supplierId:
      batch?.supplierId ??
      new URLSearchParams(window.location.search).get('supplier') ??
      '',
    name: batch?.name ?? '',
    supplierRef: detail?.supplierRef ?? '',
    boughtOn: batch?.boughtOn ?? todayWat(),
    locationId: detail?.locationId ?? options.locations[0]?.id ?? '',
    status: batch && batch.status !== 'arriving' ? 'received' : 'arriving',
    expectedOn: batch?.expectedOn ?? '',
    itemsExpected: batch ? String(batch.itemsExpected) : '',
    categoryIds: detail?.categories.map((c) => c.id) ?? [],
    ...(detail?.costs ?? { costShareMethod: 'retail' as const }),
    paidFrom: detail?.costs?.paidFrom ?? '',
    notes: detail?.notes ?? '',
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<'save' | 'intake'>();
  const [adding, setAdding] = useState(false);
  // A supplier added here is selectable before the list reloads.
  const [added, setAdded] = useState<{ id: string; name: string }>();
  const key = useRef(crypto.randomUUID());
  // Set once saved: attachments retry without saving the batch again.
  const saved = useRef<string>(undefined);
  const dirty = useRef(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    dirty.current = true;
    setDraft((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '', form: '' }));
    // Different details are a different request.
    if (!saved.current) key.current = crypto.randomUUID();
  };
  const costs = {
    costSupplierKobo: draft.costSupplierKobo ?? 0,
    costTransportKobo: draft.costTransportKobo ?? 0,
    costCustomsKobo: draft.costCustomsKobo ?? 0,
    costOtherKobo: draft.costOtherKobo ?? 0,
  };
  const total = batchTotalCostKobo(costs);
  const count = Number(draft.itemsExpected) || 0;
  const suppliers = [
    ...options.suppliers,
    ...[
      added,
      batch && { id: batch.supplierId, name: batch.supplierName },
    ].filter(
      (s): s is { id: string; name: string } =>
        !!s && !options.suppliers.some((o) => o.id === s.id),
    ),
  ];
  // Once received, only the API's Mark received changes the status.
  const statusFixed = !!batch;

  async function save(then: 'save' | 'intake') {
    const { paidFrom, itemsExpected, ...rest } = draft;
    const parsed = batchSaveSchema.safeParse({
      ...rest,
      ...costs,
      id: batch?.id ?? null,
      expectedUpdatedAt: batch?.updatedAt ?? null,
      idempotencyKey: key.current,
      itemsExpected: Number(itemsExpected),
      expectedOn: draft.status === 'arriving' ? draft.expectedOn || null : null,
      paidFrom: paidFrom || null,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        next[String(issue.path[0] ?? 'form')] ||= issue.message;
      setErrors(next);
      document
        .querySelector<HTMLElement>('.lv-batch-form [aria-invalid="true"]')
        ?.focus();
      return;
    }
    setBusy(then);
    setErrors({});
    try {
      saved.current ??= (await client.save(parsed.data)).id;
    } catch (failure) {
      setErrors(fieldErrors(failure));
      setBusy(undefined);
      return;
    }
    try {
      await uploadFiles(client, saved.current, files);
    } catch (failure) {
      setErrors({
        file:
          'The batch is saved, but a file wasn’t attached. ' +
          (failure instanceof Error && failure.name === 'BatchFileError'
            ? failure.message
            : (fieldErrors(failure).file ??
              'Check your connection and press Save again.')),
      });
      setBusy(undefined);
      return;
    }
    if (then === 'intake')
      openStaffPage('inventory', `/lots/new?batch=${saved.current}`);
    else go(`/batches/${saved.current}`);
  }
  const cancel = async () => {
    if (
      dirty.current &&
      !saved.current &&
      !(await confirm({
        title: 'Leave without saving?',
        message: 'This batch’s details will be lost.',
        confirmLabel: 'Leave',
        tone: 'danger',
      }))
    )
      return;
    go(batch ? `/batches/${batch.id}` : '/batches');
  };
  const locked = !!saved.current;
  return (
    <section className="lv-batch-form" aria-labelledby="lv-batch-form-title">
      {dialog}
      <nav className="lv-setup-breadcrumb" aria-label="Breadcrumb">
        <button
          type="button"
          className="lv-setup-link"
          onClick={() => void cancel()}
        >
          Inventory batches
        </button>{' '}
        › <span aria-current="page">{batch ? batch.code : 'New batch'}</span>
      </nav>
      <header className="lv-setup-head">
        <div>
          <h1 id="lv-batch-form-title">
            {batch ? `Edit ${batch.code}` : 'Add batch'}
            {!batch && (
              <small>
                New · {options.nextCode} when saved (next free number)
              </small>
            )}
          </h1>
          <p className="lv-setup-description">
            A batch is one purchase of stock: one supplier, one price, many
            items. Record it before intake so every lot made from it is linked
            to it.
          </p>
        </div>
      </header>
      <form
        className="lv-batch-form-grid"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save('save');
        }}
      >
        <div className="lv-setup-stack">
          <fieldset className="lv-setup-card" disabled={locked}>
            <h2>1 · Who did you buy from?</h2>
            <div className="lv-setup-grid lv-setup-grid--2">
              <div>
                <Select
                  label="Supplier"
                  value={draft.supplierId}
                  error={errors.supplierId}
                  onChange={(e) => set('supplierId', e.target.value)}
                >
                  <option value="">Choose a supplier</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
                {options.canAddSupplier && (
                  <p className="agn-hint">
                    Not in the list?{' '}
                    <button
                      type="button"
                      className="lv-setup-link"
                      onClick={() => setAdding(true)}
                    >
                      Add a new supplier
                    </button>{' '}
                    without leaving this page.
                  </p>
                )}
              </div>
              <Input
                label="Batch name"
                value={draft.name}
                maxLength={80}
                hint="A short name staff will recognise"
                error={errors.name}
                onChange={(e) => set('name', e.target.value)}
              />
              <Input
                label="Supplier’s invoice or waybill number"
                value={draft.supplierRef}
                maxLength={80}
                error={errors.supplierRef}
                onChange={(e) => set('supplierRef', e.target.value)}
              />
              <Input
                label="Bought on"
                type="date"
                value={draft.boughtOn}
                max={todayWat()}
                error={errors.boughtOn}
                onChange={(e) => set('boughtOn', e.target.value)}
              />
            </div>
          </fieldset>

          <fieldset className="lv-setup-card" disabled={locked}>
            <h2>2 · Where is it going?</h2>
            <div className="lv-setup-grid lv-setup-grid--3">
              <Select
                label="Pickup location"
                value={draft.locationId}
                error={errors.locationId}
                onChange={(e) => set('locationId', e.target.value)}
              >
                <option value="">Choose a location</option>
                {options.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} · {l.code}
                  </option>
                ))}
              </Select>
              <Select
                label="Status"
                value={draft.status}
                disabled={statusFixed}
                hint={
                  statusFixed && draft.status === 'arriving'
                    ? 'Use Mark received when it arrives.'
                    : undefined
                }
                error={errors.status}
                onChange={(e) =>
                  set('status', e.target.value as Draft['status'])
                }
              >
                <option value="arriving">Arriving</option>
                <option value="received">Received</option>
              </Select>
              {draft.status === 'arriving' && (
                <Input
                  label="Expected on"
                  type="date"
                  value={draft.expectedOn}
                  error={errors.expectedOn}
                  onChange={(e) => set('expectedOn', e.target.value)}
                />
              )}
            </div>
            <div className="lv-setup-grid lv-setup-grid--2">
              <Input
                label="Number of items (about)"
                inputMode="numeric"
                value={draft.itemsExpected}
                maxLength={6}
                hint="Your best guess. The real count comes from intake."
                error={errors.itemsExpected}
                onChange={(e) =>
                  set('itemsExpected', e.target.value.replace(/\D/g, ''))
                }
              />
              <CategoryPicker
                label="Mostly"
                options={options.categories}
                value={draft.categoryIds}
                error={errors.categoryIds}
                onChange={(v) => set('categoryIds', v)}
              />
            </div>
          </fieldset>

          <fieldset className="lv-setup-card" disabled={locked}>
            <h2>3 · What did it cost?</h2>
            <p className="lv-setup-card-note">
              Put in everything you spent to get this stock to the hub. This is
              what the batch must earn back.
            </p>
            <div className="lv-batch-costs">
              {costRows.map(([k, label, note]) => (
                <div key={k}>
                  <span id={`${k}-label`}>
                    {label}
                    {note && <small>{note}</small>}
                  </span>
                  <NairaInput
                    label={`${label} (₦)`}
                    initialValue={draft[k] ? String(draft[k] / 100) : ''}
                    placeholder="0"
                    prefix="₦"
                    decimalOnly
                    error={errors[k]}
                    onAmountChange={(v) => set(k, v)}
                  />
                </div>
              ))}
              <div className="lv-batch-total">
                <b>Total batch cost</b>
                <b aria-live="polite">{formatNaira(total)}</b>
              </div>
            </div>
            <fieldset className="lv-batch-share">
              <legend>How should the cost be shared across lots?</legend>
              {(
                [
                  [
                    'retail',
                    'By retail value',
                    'A ₦400k laptop carries more of the cost than a ₦20k blender. Best for mixed stock.',
                  ],
                  [
                    'equal',
                    'Equally',
                    'Every lot carries the same share. Fine when items are similar.',
                  ],
                ] as const
              ).map(([value, label, note]) => (
                <label
                  key={value}
                  data-active={draft.costShareMethod === value ? '' : undefined}
                >
                  <input
                    type="radio"
                    name="costShareMethod"
                    checked={draft.costShareMethod === value}
                    onChange={() => set('costShareMethod', value)}
                  />
                  <span>
                    <b>{label}</b>
                    <small>{note}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          </fieldset>

          <section className="lv-setup-card">
            <h2>4 · Payment and files</h2>
            <p className="lv-setup-card-note">
              Stock is paid for in full when you buy it.
            </p>
            <fieldset disabled={locked} className="lv-batch-plain">
              <Select
                label="Paid from (optional)"
                value={draft.paidFrom}
                error={errors.paidFrom}
                onChange={(e) =>
                  set('paidFrom', e.target.value as Draft['paidFrom'])
                }
              >
                <option value="">Not recorded</option>
                {paidFromAccounts.map((a) => (
                  <option key={a} value={a}>
                    {paidFromLabels[a]}
                  </option>
                ))}
              </Select>
            </fieldset>
            <FilePicker
              disabled={!!busy || !online}
              onFiles={(chosen) => {
                dirty.current = true;
                setErrors((e) => ({ ...e, file: '' }));
                setFiles((old) => [...old, ...chosen].slice(0, 10));
              }}
            />
            {files.length > 0 && (
              <ul className="lv-batch-chosen">
                {files.map((f, i) => (
                  <li key={f.name + i}>
                    {f.name}
                    <button
                      type="button"
                      className="lv-setup-icon-button"
                      aria-label={`Remove ${f.name}`}
                      onClick={() =>
                        setFiles((old) => old.filter((_, n) => n !== i))
                      }
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {errors.file && (
              <p className="lv-setup-error" role="alert">
                {errors.file}
              </p>
            )}
            <fieldset disabled={locked} className="lv-batch-plain">
              <Textarea
                label="Notes"
                value={draft.notes}
                maxLength={1000}
                rows={2}
                placeholder="Anything staff should know, e.g. 12 phones have no chargers"
                onChange={(e) => set('notes', e.target.value)}
              />
            </fieldset>
          </section>
        </div>

        <aside className="lv-batch-rail">
          <section className="lv-batch-dark" aria-label="This batch">
            <span>This batch</span>
            <h2>{draft.name.trim() || 'New batch'}</h2>
            <dl>
              <div>
                <dt>Total cost</dt>
                <dd>{shortNaira(total)}</dd>
              </div>
              <div>
                <dt>Items</dt>
                <dd>{count ? `~${count.toLocaleString('en-NG')}` : '—'}</dd>
              </div>
              <div>
                <dt>Cost per item</dt>
                <dd>
                  {count && total
                    ? formatNaira(Math.round(total / count / 100) * 100)
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Paid from</dt>
                <dd>
                  {draft.paidFrom
                    ? paidFromLabels[draft.paidFrom].replace(' account', '')
                    : '—'}
                </dd>
              </div>
            </dl>
            <p>
              To break even, lots from this batch must sell for{' '}
              <b>{shortNaira(total)}</b> in total, after fees.
            </p>
          </section>
          <section className="lv-setup-card">
            <h2>What happens next</h2>
            <ol className="lv-batch-steps">
              <li>
                When it arrives, mark it <b>Received</b>.
              </li>
              <li>
                Intake staff pick this batch when they photograph each item, so
                every lot is linked to it.
              </li>
              <li>
                The batch page shows money coming back as lots sell, and what’s
                left unsold.
              </li>
              <li>It closes when every item is sold or written off.</li>
            </ol>
          </section>
          {errors.form && (
            <p className="lv-setup-alert" role="alert">
              {errors.form}
            </p>
          )}
          {!online && (
            <p className="lv-setup-inline-note" role="status">
              You’re offline. Reconnect to save.
            </p>
          )}
          <div className="lv-batch-buttons">
            <Button
              type="submit"
              busy={busy === 'save'}
              disabled={!!busy || !online}
            >
              Save batch
            </Button>
            <Button
              variant="secondary"
              size="small"
              busy={busy === 'intake'}
              disabled={!!busy || !online}
              onClick={() => void save('intake')}
            >
              Save and start intake
            </Button>
            <Button
              variant="secondary"
              size="small"
              disabled={!!busy}
              onClick={() => void cancel()}
            >
              Cancel
            </Button>
          </div>
        </aside>
      </form>
      {adding && (
        <AddSupplierDialog
          setup={setup}
          categories={options.categories}
          canSeeBank={canSeeBank}
          onClose={() => setAdding(false)}
          onAdded={(supplier) => {
            setAdding(false);
            setAdded(supplier);
            set('supplierId', supplier.id);
            reloadOptions();
          }}
        />
      )}
    </section>
  );
}

export function CategoryPicker({
  label,
  options,
  value,
  error,
  disabled,
  onChange,
}: {
  label: string;
  options: { id: string; name: string }[];
  value: string[];
  error?: string;
  disabled?: boolean;
  onChange: (value: string[]) => void;
}) {
  return (
    <fieldset className="lv-batch-chips" disabled={disabled}>
      <legend>{label}</legend>
      <div className="lv-setup-chip-row">
        {options.map((c) => {
          const on = value.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              className="lv-setup-chip"
              aria-pressed={on}
              onClick={() =>
                onChange(
                  on ? value.filter((v) => v !== c.id) : [...value, c.id],
                )
              }
            >
              {on && <Check size={14} aria-hidden="true" />}
              {c.name}
            </button>
          );
        })}
      </div>
      {error && <p className="agn-field-error">{error}</p>}
    </fieldset>
  );
}

function AddSupplierDialog({
  setup,
  categories,
  canSeeBank,
  onClose,
  onAdded,
}: {
  setup: LotSetupClient;
  categories: { id: string; name: string }[];
  canSeeBank: boolean;
  onClose: () => void;
  onAdded: (supplier: { id: string; name: string }) => void;
}) {
  const [draft, setDraft] = useState<SupplierDraft>(emptySupplier);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  return (
    <Dialog
      open
      title="Add a new supplier"
      onClose={busy ? () => undefined : onClose}
    >
      <form
        className="lv-setup-form"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErrors({});
          try {
            const result = await setup.saveSupplier({
              ...supplierInput(draft, canSeeBank),
              idempotencyKey: key.current,
            });
            onAdded({ id: result.id, name: draft.name.trim() });
          } catch (failure) {
            setErrors(fieldErrors(failure));
            setBusy(false);
          }
        }}
      >
        <SupplierFields
          draft={draft}
          errors={errors}
          canSeeBank={canSeeBank}
          categories={categories}
          small
          onChange={(next) => {
            setDraft(next);
            key.current = crypto.randomUUID();
          }}
        />
        {errors.form && (
          <p className="lv-setup-error" role="alert">
            {errors.form}
          </p>
        )}
        <div className="lv-setup-actions lv-setup-actions--end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            Add supplier
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
