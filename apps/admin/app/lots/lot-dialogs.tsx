'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  databaseValues,
  LOT_RESTORE_DAYS,
  LOT_RUN_TIME_PRESETS,
  type LotSetupOptions,
} from '@auction-ng/shared';
import { ApiError } from '@auction-ng/api-client/auth';
import type { LotsClient } from '@auction-ng/api-client/lots';
import { Button } from '@auction-ng/ui/web/button';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Input } from '@auction-ng/ui/web/input';
import { NairaInput } from '@auction-ng/ui/web/naira-input';
import { Select } from '@auction-ng/ui/web/select';
import {
  CircleAlert,
  Download,
  FileSpreadsheet,
  Trash2,
} from '@auction-ng/ui/web/icons';
import { conditionLabel } from './lots-ui';

/**
 * Opens another staff section without reloading the page. A full reload
 * renews the session from scratch, which signed staff out in development.
 */
export function openStaffSection(section: string, url: string) {
  history.pushState(null, '', url);
  window.dispatchEvent(
    new CustomEvent('lotvanta:open-section', { detail: section }),
  );
  window.scrollTo({ top: 0 });
}
export const openLiveMonitor = (lotId: string) =>
  openStaffSection('live-monitor', liveMonitorLink(lotId));

export const liveMonitorLink = (lotId: string) =>
  `/?section=live-monitor&view=details&lot=${encodeURIComponent(lotId)}`;

export type DeleteTarget = {
  id: string;
  lotNumber: string;
  title: string;
  stageLabel: string;
  bids: number;
  binCode: string | null;
  updatedAt: string;
};

const REASONS = [
  'Duplicate of another lot',
  'Entered by mistake',
  'Item not available',
  'Item damaged beyond sale',
  'Supplier took it back',
];

export function apiMessage(failure: unknown, fallback: string) {
  return failure instanceof ApiError && failure.detail
    ? failure.detail
    : failure instanceof ApiError && failure.status === 403
      ? 'Your role can’t do this. Ask an admin.'
      : failure instanceof ApiError && failure.status === 409
        ? 'This lot changed. Reload and try again.'
        : fallback;
}

/** Delete with a reason; a refused delete turns into the explanation. */
export function DeleteLotDialog({
  target,
  client,
  onClose,
  onDone,
}: {
  target: DeleteTarget;
  client: LotsClient;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [reason, setReason] = useState(REASONS[0] ?? '');
  const [other, setOther] = useState('');
  const [freeBin, setFreeBin] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState<{ kind: string; message: string }>();
  const text = reason === 'Other' ? other.trim() : reason;
  async function submit() {
    setBusy(true);
    setError('');
    try {
      const result = await client.remove(target.id, {
        reason: text,
        freeBin: !!target.binCode && freeBin,
        expectedUpdatedAt: target.updatedAt,
      });
      onDone(result.message);
    } catch (failure) {
      if (
        failure instanceof ApiError &&
        failure.field?.startsWith('delete.') &&
        failure.field !== 'delete.permission'
      )
        setBlocked({
          kind: failure.field.slice('delete.'.length),
          message: failure.detail ?? '',
        });
      else
        setError(
          apiMessage(failure, 'The lot couldn’t be deleted. Try again.'),
        );
    } finally {
      setBusy(false);
    }
  }
  if (blocked)
    return (
      <LotBlockedDialog
        target={target}
        kind={blocked.kind}
        message={blocked.message}
        onClose={onClose}
      />
    );
  return (
    <Dialog
      open
      onClose={busy ? () => undefined : onClose}
      title={`Delete ${target.lotNumber}?`}
    >
      <form
        className="lv-lots-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <span className="lv-lots-icon">
          <Trash2 size={20} aria-hidden="true" />
        </span>
        <p>
          {target.title} · {target.stageLabel} ·{' '}
          {target.bids ? `${target.bids} bids` : 'no bids'}. It moves to{' '}
          <strong>Deleted</strong> and an admin can restore it for{' '}
          {LOT_RESTORE_DAYS} days.
        </p>
        <Select
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          {[...REASONS, 'Other'].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
        {reason === 'Other' && (
          <Input
            label="Tell us why"
            value={other}
            maxLength={200}
            onChange={(e) => setOther(e.target.value)}
          />
        )}
        {target.binCode && (
          <label className="lv-lots-check">
            <input
              type="checkbox"
              checked={freeBin}
              onChange={(e) => setFreeBin(e.target.checked)}
            />
            Free bin {target.binCode} for new stock
          </label>
        )}
        {error && (
          <p className="lv-lots-error" role="alert">
            {error}
          </p>
        )}
        <div className="lv-lots-dialog-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            busy={busy}
            disabled={text.length < 3}
          >
            Delete lot
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function LotBlockedDialog({
  target,
  kind,
  message,
  onClose,
}: {
  target: Pick<DeleteTarget, 'id' | 'lotNumber'>;
  kind: string;
  message: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${target.lotNumber} can’t be deleted`}
    >
      <div className="lv-lots-dialog">
        <span className="lv-lots-icon" data-tone="warn">
          <CircleAlert size={20} aria-hidden="true" />
        </span>
        <p>{message}</p>
        <div className="lv-lots-dialog-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          {(kind === 'never' || kind === 'cancelfirst') && (
            <Button type="button" onClick={() => openLiveMonitor(target.id)}>
              Cancel in Live monitor
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

export type BulkAction = 'edit' | 'move' | 'archive' | 'delete';
const bulkTitle: Record<BulkAction, string> = {
  edit: 'Edit fields',
  move: 'Move location',
  archive: 'Archive lots',
  delete: 'Delete lots',
};

/** Bulk changes; the result lists every skipped lot and why. */
export function BulkDialog({
  action,
  ids,
  options,
  client,
  onClose,
  onDone,
}: {
  action: BulkAction;
  ids: string[];
  options: LotSetupOptions | undefined;
  client: LotsClient;
  onClose: () => void;
  onDone: () => void;
}) {
  const [categoryId, setCategoryId] = useState('');
  const [condition, setCondition] = useState('');
  const [locationId, setLocationId] = useState('');
  const [price, setPrice] = useState<number>();
  const [hours, setHours] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] =
    useState<Awaited<ReturnType<LotsClient['bulk']>>>();
  const [key] = useState(() => crypto.randomUUID());
  const changes = {
    ...(categoryId ? { categoryId } : {}),
    ...(condition
      ? {
          condition: condition as (typeof databaseValues.lotConditions)[number],
        }
      : {}),
    ...(locationId ? { locationId } : {}),
    ...(price ? { startPriceKobo: price } : {}),
    ...(hours ? { runTimeMinutes: Number(hours) * 60 } : {}),
  };
  const ready =
    action === 'archive' ||
    (action === 'delete' && reason.trim().length >= 3) ||
    (action === 'move' && !!locationId) ||
    (action === 'edit' && Object.keys(changes).length > 0);
  async function submit() {
    setBusy(true);
    setError('');
    try {
      const r = await client.bulk({
        ids,
        action,
        ...(action === 'edit' || action === 'move' ? { changes } : {}),
        ...(action === 'delete' || action === 'archive'
          ? { reason: reason.trim() || undefined }
          : {}),
        idempotencyKey: key,
      });
      setResult(r);
      onDone();
    } catch (failure) {
      setError(
        apiMessage(
          failure,
          'The change couldn’t be confirmed. Try again; nothing is applied twice.',
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const count = `${ids.length} ${ids.length === 1 ? 'lot' : 'lots'}`;
  return (
    <Dialog
      open
      onClose={busy ? () => undefined : onClose}
      title={`${bulkTitle[action]} · ${count}`}
    >
      {result ? (
        <div className="lv-lots-dialog">
          <p className="lv-lots-toast" role="status">
            {result.done} {result.done === 1 ? 'lot' : 'lots'} changed.
          </p>
          {result.skipped.length > 0 && (
            <div className="lv-lots-skips">
              <strong>{result.skipped.length} skipped</strong>
              <ul>
                {result.skipped.slice(0, 20).map((s) => (
                  <li key={s.id}>
                    {s.lotNumber}: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="lv-lots-dialog-actions">
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="lv-lots-dialog"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {action === 'edit' && (
            <>
              <p>
                Change only the fields you fill in. Lots that are live, have
                bids or have ended are skipped and listed.
              </p>
              <Select
                label="Category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">Keep as it is</option>
                {options?.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.path}
                  </option>
                ))}
              </Select>
              <Select
                label="Condition"
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
              >
                <option value="">Keep as it is</option>
                {databaseValues.lotConditions.map((c) => (
                  <option key={c} value={c}>
                    {conditionLabel(c)}
                  </option>
                ))}
              </Select>
              <NairaInput
                label="Start price (₦)"
                onAmountChange={setPrice}
                hint="Leave empty to keep each lot’s price."
              />
              <Select
                label="Run time"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              >
                <option value="">Keep as it is</option>
                {LOT_RUN_TIME_PRESETS.map((h) => (
                  <option key={h} value={h}>
                    {h} hours
                  </option>
                ))}
              </Select>
            </>
          )}
          {(action === 'edit' || action === 'move') && (
            <Select
              label={
                action === 'move'
                  ? 'Move to pickup location'
                  : 'Pickup location'
              }
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              hint="Moving clears the bin; put the items in a bin at the new location."
            >
              <option value="">
                {action === 'move' ? 'Choose a location' : 'Keep as it is'}
              </option>
              {options?.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {l.code}
                </option>
              ))}
            </Select>
          )}
          {action === 'archive' && (
            <p>
              Archive {count}? They leave the default lists but stay searchable
              and in reports. Only drafts and ended lots can be archived; the
              rest are skipped.
            </p>
          )}
          {action === 'delete' && (
            <>
              <p>
                Delete {count}? Drafts and scheduled lots move to Deleted (an
                admin can restore them for {LOT_RESTORE_DAYS} days). Live and
                ended lots are skipped.
              </p>
              <Input
                label="Reason"
                value={reason}
                maxLength={200}
                onChange={(e) => setReason(e.target.value)}
              />
            </>
          )}
          {error && (
            <p className="lv-lots-error" role="alert">
              {error}
            </p>
          )}
          <div className="lv-lots-dialog-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={action === 'delete' ? 'danger' : 'primary'}
              busy={busy}
              disabled={!ready}
            >
              {action === 'delete'
                ? `Delete ${count}`
                : action === 'archive'
                  ? `Archive ${count}`
                  : `Change ${count}`}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'text/csv;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Template → upload → check report → import the good rows as drafts. */
export function ImportDialog({
  client,
  options,
  onClose,
  onImported,
}: {
  client: LotsClient;
  options: LotSetupOptions | undefined;
  onClose: () => void;
  onImported: (message: string) => void;
}) {
  const [categoryId, setCategoryId] = useState('');
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] =
    useState<Awaited<ReturnType<LotsClient['csvCheck']>>>();
  const [key, setKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    setReport(undefined);
    setKey(crypto.randomUUID());
  }, [categoryId, csv]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (failure) {
      setError(
        apiMessage(
          failure,
          'That didn’t work. Check your connection and try again.',
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={busy ? () => undefined : onClose}
      title="Import lots from CSV"
    >
      <div className="lv-lots-dialog">
        <p>
          Lots are imported as drafts. Each category has its own template with
          its item details; prices are in Naira. Up to 2,000 rows.
        </p>
        <Select
          label="1. Category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">Choose a category</option>
          {options?.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.path}
            </option>
          ))}
        </Select>
        <div>
          <Button
            type="button"
            variant="secondary"
            disabled={!categoryId || busy}
            onClick={() =>
              void run(async () => {
                const t = await client.csvTemplate(categoryId);
                downloadText(t.filename, t.csv);
              })
            }
          >
            <Download size={16} aria-hidden="true" /> 2. Download template
          </Button>
        </div>
        <label className="agn-field">
          <span>3. Upload the filled-in file</span>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={!categoryId}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 4_000_000) {
                setError('The file is too large. Keep it under 4 MB.');
                return;
              }
              setFileName(file.name);
              setCsv(await file.text());
            }}
          />
          {fileName && <small>{fileName}</small>}
        </label>
        {report && (
          <>
            <p
              className={
                report.problems.length ? 'lv-lots-error' : 'lv-lots-toast'
              }
              role="status"
            >
              {report.good} of {report.rows} rows are ready to import
              {report.problems.length
                ? `; ${report.rows - report.good} have problems.`
                : '.'}
            </p>
            {report.problems.length > 0 && (
              <div className="lv-lots-report">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Row</th>
                      <th scope="col">Column</th>
                      <th scope="col">Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.problems.map((p, i) => (
                      <tr key={i}>
                        <td>{p.row}</td>
                        <td>{p.field}</td>
                        <td>{p.problem}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        {error && (
          <p className="lv-lots-error" role="alert">
            {error}
          </p>
        )}
        <div className="lv-lots-dialog-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          {!report ? (
            <Button
              type="button"
              busy={busy}
              disabled={!categoryId || !csv}
              onClick={() =>
                void run(async () =>
                  setReport(await client.csvCheck(categoryId, csv)),
                )
              }
            >
              <FileSpreadsheet size={16} aria-hidden="true" /> 4. Check the file
            </Button>
          ) : (
            <Button
              type="button"
              busy={busy}
              disabled={!report.good}
              onClick={() =>
                void run(async () => {
                  const r = await client.csvImport(categoryId, csv, key);
                  onImported(
                    `${r.imported} ${r.imported === 1 ? 'lot' : 'lots'} imported as drafts${r.problems ? `; ${r.problems} rows skipped` : ''}.`,
                  );
                })
              }
            >
              Import {report.good} good {report.good === 1 ? 'row' : 'rows'}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

export type MoreFilterValues = {
  runTimeMinutes?: string;
  addedByIds?: string;
  addedFrom?: string;
  addedTo?: string;
  priceMinKobo?: string;
  priceMaxKobo?: string;
  supplierIds?: string;
};

export function MoreFiltersDialog({
  values,
  options,
  staff,
  onClose,
  onApply,
}: {
  values: MoreFilterValues;
  options: LotSetupOptions | undefined;
  staff: { id: string; name: string }[];
  onClose: () => void;
  onApply: (values: MoreFilterValues) => void;
}) {
  const [v, setV] = useState(values);
  const set = (k: keyof MoreFilterValues, value: string) =>
    setV((old) => ({ ...old, [k]: value || undefined }));
  const naira = (kobo?: string) => (kobo ? String(Number(kobo) / 100) : '');
  const sortedStaff = useMemo(
    () => [...staff].sort((a, b) => a.name.localeCompare(b.name)),
    [staff],
  );
  return (
    <Dialog open onClose={onClose} title="More filters">
      <form
        className="lv-lots-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          onApply(v);
        }}
      >
        <Select
          label="Run time"
          value={v.runTimeMinutes ?? ''}
          onChange={(e) => set('runTimeMinutes', e.target.value)}
        >
          <option value="">Any</option>
          {LOT_RUN_TIME_PRESETS.map((h) => (
            <option key={h} value={h * 60}>
              {h} hours
            </option>
          ))}
        </Select>
        <Select
          label="Added by"
          value={v.addedByIds ?? ''}
          onChange={(e) => set('addedByIds', e.target.value)}
        >
          <option value="">Anyone</option>
          {sortedStaff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <div className="lv-lot-grid2">
          <Input
            label="Added from"
            type="date"
            value={v.addedFrom ?? ''}
            onChange={(e) => set('addedFrom', e.target.value)}
          />
          <Input
            label="Added to"
            type="date"
            value={v.addedTo ?? ''}
            onChange={(e) => set('addedTo', e.target.value)}
          />
        </div>
        <div className="lv-lot-grid2">
          <NairaInput
            label="Start price from (₦)"
            initialValue={naira(v.priceMinKobo)}
            onAmountChange={(k) =>
              set('priceMinKobo', k === undefined ? '' : String(k))
            }
          />
          <NairaInput
            label="Start price to (₦)"
            initialValue={naira(v.priceMaxKobo)}
            onAmountChange={(k) =>
              set('priceMaxKobo', k === undefined ? '' : String(k))
            }
          />
        </div>
        <Select
          label="Supplier"
          value={v.supplierIds ?? ''}
          onChange={(e) => set('supplierIds', e.target.value)}
        >
          <option value="">Any supplier</option>
          {options?.suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <div className="lv-lots-dialog-actions">
          <Button type="button" variant="secondary" onClick={() => setV({})}>
            Clear these
          </Button>
          <Button type="submit">Apply filters</Button>
        </div>
      </form>
    </Dialog>
  );
}
