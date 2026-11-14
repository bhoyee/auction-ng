'use client';
import {
  deleteConfirmation,
  useConfirm,
} from '@auction-ng/ui/admin/confirm-dialog';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  binLookLabels,
  binRange,
  type BinLook,
  type BinLabels,
  type BinPage,
  type BinRow,
} from '@auction-ng/shared';
import { Button } from '@auction-ng/ui/web/button';
import { Input } from '@auction-ng/ui/web/input';
import { Switch } from '@auction-ng/ui/admin/switch';
import { Pencil, Printer, Search, Trash2 } from '@auction-ng/ui/web/icons';
import {
  describeFailure,
  errorFor,
  useLoad,
  useSetupClient,
  type FieldErrors,
  type SetupContext,
} from './setup-data';

// One colour per bin state, used for the row edge, the fill bar and the
// status pill. Empty is neutral (free space is normal); red is kept for full.
const lookOf = (bin: BinRow): BinLook =>
  bin.acceptsNewLots ? bin.fill : 'closed';
type Filter = 'all' | 'in_use' | 'empty' | 'almost_full' | 'full' | 'closed';
const filterLabel: Record<Filter, string> = {
  all: 'All',
  in_use: 'In use',
  empty: 'Empty',
  almost_full: 'Almost full',
  full: 'Full',
  closed: 'Not for new lots',
};
const filterTone: Partial<Record<Filter, BinLook>> = {
  in_use: 'has_space',
  empty: 'empty',
  almost_full: 'almost_full',
  full: 'full',
  closed: 'closed',
};

type Label = BinLabels['items'][number] & { svg: string };

// Renders QR labels into the print-only sheet, then opens the print dialog.
async function renderLabels(labels: BinLabels): Promise<Label[]> {
  const QR = await import('qrcode');
  return Promise.all(
    labels.items.map(async (l) => ({
      ...l,
      svg: await QR.toString(l.qr, { type: 'svg', margin: 1, width: 160 }),
    })),
  );
}

export function BinsPage({
  ctx,
  locationId,
  onBack,
}: {
  ctx: SetupContext;
  locationId: string;
  onBack: () => void;
}) {
  const { confirm, dialog } = useConfirm();
  const client = useSetupClient(ctx);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [version, setVersion] = useState(0);
  const [cursor, setCursor] = useState<string>();
  const [rows, setRows] = useState<BinRow[]>([]);
  const page = useLoad(
    ctx,
    () => client.bins(locationId, { status: filter, search: query, cursor }),
    [locationId, filter, query, cursor, version],
  );
  const [editing, setEditing] = useState<BinRow>();
  const [toast, setToast] = useState('');
  const [problem, setProblem] = useState('');
  const [labels, setLabels] = useState<Label[]>([]);
  useEffect(() => {
    const handle = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(handle);
  }, [search]);
  useEffect(() => {
    setCursor(undefined);
  }, [filter, query, version]);
  useEffect(() => {
    if (!page.data) return;
    setRows((current) =>
      cursor ? [...current, ...page.data!.items] : page.data!.items,
    );
  }, [page.data]);
  useEffect(() => {
    if (!labels.length) return;
    const done = () => setLabels([]);
    window.addEventListener('afterprint', done, { once: true });
    const timer = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', done);
    };
  }, [labels]);
  const data = page.data;
  const refresh = () => {
    setVersion((v) => v + 1);
    ctx.onChanged();
  };
  async function print(ids?: string[]) {
    setProblem('');
    try {
      const sheet = await renderLabels(await client.binLabels(locationId, ids));
      if (!sheet.length) setProblem('There are no bins to print yet.');
      setLabels(sheet);
    } catch (failure) {
      setProblem(
        describeFailure(failure, ctx).form ?? 'Labels could not be loaded.',
      );
    }
  }
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
  if (page.forbidden)
    return <p className="lv-setup-alert">Your role can’t view bins.</p>;
  const name = data?.location.name ?? 'Location';
  return (
    <>
      {dialog}
      <section className="lv-setup" aria-labelledby="lv-bins-title">
        <nav className="lv-setup-breadcrumb" aria-label="Breadcrumb">
          <button type="button" className="lv-setup-link" onClick={onBack}>
            Lot setup
          </button>
          <span aria-hidden="true"> › </span>
          <button type="button" className="lv-setup-link" onClick={onBack}>
            Pickup locations
          </button>
          <span aria-hidden="true"> › </span>
          <span aria-current="page">{name}</span>
        </nav>
        <header className="lv-setup-head">
          <div>
            <h1 id="lv-bins-title">Bins · {name}</h1>
            <p className="lv-setup-description">
              A bin is any named spot where you keep lots: a shelf, a cage, a
              corner of the floor. It just helps staff find an item at pickup.
            </p>
          </div>
          <Button variant="secondary" onClick={() => void print()}>
            <Printer size={18} aria-hidden="true" /> Print all labels
          </Button>
        </header>
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
        <div className="lv-setup-bins">
          <div className="lv-setup-stack">
            <div className="lv-setup-kpis">
              <Kpi
                label="Bins"
                value={data?.summary.bins}
                note={`${data?.summary.openForNewLots ?? '–'} open for new lots`}
              />
              <Kpi
                label="Lots in bins"
                value={data?.summary.lotsInBins}
                note={`of ${data?.summary.lotsAtLocation.toLocaleString('en-NG') ?? '–'} lots at this hub`}
              />
              <Kpi
                label="Lots with no bin"
                value={data?.summary.lotsWithoutBin}
                note={
                  data && data.summary.lotsWithoutBin > 0 ? (
                    <a
                      className="lv-setup-link"
                      href={`?section=inventory&location=${locationId}&bin=none`}
                    >
                      Put them in a bin
                    </a>
                  ) : (
                    'Every lot here has a bin'
                  )
                }
                warn={!!data && data.summary.lotsWithoutBin > 0}
              />
            </div>
            <div className="lv-setup-card lv-setup-card--flush">
              <div className="lv-setup-table-tools">
                <label className="lv-setup-search">
                  <Search size={18} aria-hidden="true" />
                  <span className="sr-only">Search bins</span>
                  <input
                    type="search"
                    placeholder="Search bins"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <div
                  className="lv-setup-filters"
                  role="group"
                  aria-label="Filter bins"
                >
                  {(
                    [
                      'all',
                      'in_use',
                      'empty',
                      'almost_full',
                      'full',
                      'closed',
                    ] as const
                  ).map((key) => (
                    <button
                      key={key}
                      type="button"
                      className="lv-setup-chip lv-setup-chip--bin"
                      data-look={filterTone[key]}
                      aria-pressed={filter === key}
                      onClick={() => setFilter(key)}
                    >
                      {filterTone[key] && (
                        <span className="lv-bin-dot" aria-hidden="true" />
                      )}
                      {filterLabel[key]} {data ? data.counts[key] : ''}
                    </button>
                  ))}
                </div>
              </div>
              {page.loading && !data ? (
                <div
                  className="lv-setup-skeleton lv-setup-skeleton--rows"
                  aria-busy="true"
                />
              ) : page.error && !data ? (
                <div className="lv-setup-state" role="alert">
                  <p>{page.error}</p>
                  <Button variant="secondary" onClick={page.refresh}>
                    Try again
                  </Button>
                </div>
              ) : !rows.length ? (
                <div className="lv-setup-state">
                  {data?.counts.all ? (
                    <p>
                      No bins match.{' '}
                      <button
                        type="button"
                        className="lv-setup-link"
                        onClick={() => {
                          setSearch('');
                          setFilter('all');
                        }}
                      >
                        Clear filters
                      </button>
                    </p>
                  ) : (
                    <p>No bins yet. Add the first one on the right.</p>
                  )}
                </div>
              ) : (
                <div
                  className="lv-bin-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Bins list"
                >
                  <table className="lv-setup-table lv-setup-table--bins">
                    <thead>
                      <tr>
                        <th scope="col">Bin</th>
                        <th scope="col">Note for staff</th>
                        <th scope="col" className="lv-setup-right">
                          Items inside
                        </th>
                        <th scope="col">Status</th>
                        <th scope="col">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((bin) => {
                        const look = lookOf(bin);
                        const percent = bin.capacity
                          ? Math.min(
                              100,
                              Math.round((bin.lots * 100) / bin.capacity),
                            )
                          : null;
                        return (
                          <tr
                            key={bin.id}
                            className="lv-bin-row"
                            data-look={look}
                          >
                            <td>
                              <span className="lv-setup-bin-code">
                                {bin.code}
                              </span>
                            </td>
                            <td>
                              {bin.note ?? (
                                <span className="lv-setup-muted">—</span>
                              )}
                            </td>
                            <td className="lv-setup-right">
                              {bin.lots ? (
                                <a
                                  className="lv-setup-link"
                                  href={`?section=inventory&location=${locationId}&bin=${bin.id}`}
                                  aria-label={
                                    bin.capacity
                                      ? `${bin.lots} of ${bin.capacity} items`
                                      : `${bin.lots} items`
                                  }
                                >
                                  {bin.lots.toLocaleString('en-NG')}
                                  {bin.capacity
                                    ? ` / ${bin.capacity.toLocaleString('en-NG')}`
                                    : ''}
                                </a>
                              ) : bin.capacity ? (
                                <span className="lv-setup-muted">
                                  0 / {bin.capacity.toLocaleString('en-NG')}
                                </span>
                              ) : (
                                <span className="lv-setup-muted">—</span>
                              )}
                              {percent !== null && (
                                <span
                                  className="lv-bin-meter"
                                  aria-hidden="true"
                                  title={`${percent}% of this bin’s limit`}
                                >
                                  <span style={{ width: `${percent}%` }} />
                                </span>
                              )}
                            </td>
                            <td>
                              <span className="lv-bin-status" data-look={look}>
                                <span
                                  className="lv-bin-dot"
                                  aria-hidden="true"
                                />
                                {binLookLabels[look]}
                              </span>
                              {look === 'closed' && bin.full && (
                                <span
                                  className="lv-setup-pill lv-setup-pill--gap"
                                  data-tone="red"
                                  title="Items inside have reached this bin’s limit. Staff can still use it."
                                >
                                  Full
                                </span>
                              )}
                            </td>
                            <td className="lv-setup-row-actions">
                              {ctx.canManage && (
                                <button
                                  type="button"
                                  className="lv-setup-icon-button"
                                  aria-label={`Edit ${bin.code}`}
                                  onClick={() => setEditing(bin)}
                                >
                                  <Pencil size={16} aria-hidden="true" />
                                </button>
                              )}
                              <button
                                type="button"
                                className="lv-setup-icon-button"
                                aria-label={`Print label for ${bin.code}`}
                                onClick={() => void print([bin.id])}
                              >
                                <Printer size={16} aria-hidden="true" />
                              </button>
                              {ctx.canManage && (
                                <button
                                  type="button"
                                  className="lv-setup-icon-button lv-setup-icon-button--danger"
                                  aria-label={
                                    bin.deleteCheck.allowed
                                      ? `Delete ${bin.code}`
                                      : `${bin.code} can't be deleted: ${bin.deleteCheck.reason}`
                                  }
                                  title={
                                    bin.deleteCheck.allowed
                                      ? undefined
                                      : bin.deleteCheck.reason
                                  }
                                  disabled={!bin.deleteCheck.allowed}
                                  onClick={async () => {
                                    if (
                                      await confirm(
                                        deleteConfirmation('bin', bin.code),
                                      )
                                    )
                                      void act(() =>
                                        client.deleteBin({
                                          id: bin.id,
                                          expectedUpdatedAt: bin.updatedAt,
                                        }),
                                      );
                                  }}
                                >
                                  <Trash2 size={16} aria-hidden="true" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="lv-setup-table-foot">
                <p>
                  Showing {rows.length} of {data?.counts.all ?? 0}. “Almost
                  full” means 80% of a bin’s limit is used. A bin can be deleted
                  only when it’s empty. A bin you stop using can be set to “Not
                  for new lots” and keeps its history.
                </p>
                {data?.nextCursor && (
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => setCursor(data.nextCursor ?? undefined)}
                  >
                    Show more
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="lv-setup-stack">
            {ctx.canManage && data && (
              <AddBinPanel
                key={editing?.id ?? 'new'}
                ctx={ctx}
                page={data}
                editing={editing}
                onDone={(message, printIds) => {
                  setEditing(undefined);
                  setToast(message);
                  refresh();
                  if (printIds) void print(printIds);
                }}
                onCancel={() => setEditing(undefined)}
                printLabels={print}
              />
            )}
            {data && (
              <section className="lv-setup-card lv-setup-rule">
                <Switch
                  label="Bin must be set before publishing"
                  checked={data.location.binRequiredToPublish}
                  disabled={!ctx.canManage}
                  onChange={(binRequiredToPublish) =>
                    void act(() =>
                      client.locationBinRule({
                        id: locationId,
                        binRequiredToPublish,
                        expectedUpdatedAt: data.location.updatedAt,
                      }),
                    )
                  }
                />
                <p className="lv-setup-muted lv-setup-small">
                  {data.location.binRequiredToPublish
                    ? 'On: lots at this hub can’t be published until they have a bin.'
                    : 'Off: staff can add the bin later. Lots with no bin show a red “no bin” on the Lots list.'}
                </p>
              </section>
            )}
          </div>
        </div>
        {labels.length > 0 &&
          // Rendered straight under <body> so printing can drop the rest of
          // the page instead of printing it as blank space.
          createPortal(
            <div className="lv-print-labels" aria-hidden="true">
              {labels.map((l) => (
                <figure key={l.id} className="lv-print-label">
                  {/* Bin name on one line across the top; longer names
                      print smaller instead of wrapping. */}
                  <strong
                    className="lv-print-code"
                    data-size={
                      l.code.length <= 10
                        ? 'large'
                        : l.code.length <= 14
                          ? 'medium'
                          : 'small'
                    }
                  >
                    {l.code}
                  </strong>
                  <div className="lv-print-body">
                    <span
                      className="lv-print-qr"
                      // SVG generated locally by the qrcode library from our own data.
                      dangerouslySetInnerHTML={{ __html: l.svg }}
                    />
                    <figcaption>
                      <span className="lv-print-field">
                        <small>Location</small>
                        <span>
                          {l.locationCode} · {l.locationName}
                        </span>
                      </span>
                      {l.note && (
                        <span className="lv-print-field lv-print-note">
                          <small>Note for staff</small>
                          <span>{l.note}</span>
                        </span>
                      )}
                    </figcaption>
                  </div>
                  <span className="lv-print-foot">
                    LotVanta · scan at intake and pickup
                  </span>
                </figure>
              ))}
            </div>,
            document.body,
          )}
      </section>
    </>
  );
}

function Kpi({
  label,
  value,
  note,
  warn = false,
}: {
  label: string;
  value?: number;
  note: React.ReactNode;
  warn?: boolean;
}) {
  return (
    <div className="lv-setup-card lv-setup-kpi" data-warn={warn || undefined}>
      <p>{label}</p>
      <strong>
        {value === undefined ? '–' : value.toLocaleString('en-NG')}
      </strong>
      <span>{note}</span>
    </div>
  );
}

function AddBinPanel({
  ctx,
  page,
  editing,
  onDone,
  onCancel,
  printLabels,
}: {
  ctx: SetupContext;
  page: BinPage;
  editing?: BinRow;
  onDone: (message: string, printIds?: string[]) => void;
  onCancel: () => void;
  printLabels: (ids?: string[]) => Promise<void>;
}) {
  const client = useSetupClient(ctx);
  const [mode, setMode] = useState<'one' | 'many'>('one');
  const [code, setCode] = useState(editing?.code ?? '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [limit, setLimit] = useState(
    editing?.capacity ? String(editing.capacity) : '',
  );
  const [accepts, setAccepts] = useState(editing?.acceptsNewLots ?? true);
  const [prefix, setPrefix] = useState('S-');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [printAfter, setPrintAfter] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const capacity = limit.trim() === '' ? null : Number(limit);
  const preview =
    from !== '' && to !== ''
      ? binRange(prefix, Number(from), Number(to), page.existingCodes)
      : undefined;

  async function submit() {
    setBusy(true);
    setErrors({});
    try {
      if (mode === 'many' && !editing) {
        if (!preview?.ok) {
          setErrors({
            prefix:
              preview?.error ?? 'Enter the start of the name and both numbers.',
          });
          return;
        }
        const result = await client.addBins({
          locationId: page.location.id,
          prefix,
          from: Number(from),
          to: Number(to),
          note,
          capacity,
        });
        if (printAfter) {
          const labels = await client.binLabels(page.location.id);
          onDone(
            result.message,
            labels.items
              .filter((l) => preview.codes.includes(l.code))
              .map((l) => l.id),
          );
        } else onDone(result.message);
        return;
      }
      const result = await client.saveBin({
        ...(editing
          ? { id: editing.id, expectedUpdatedAt: editing.updatedAt }
          : {}),
        locationId: page.location.id,
        code,
        note,
        capacity,
        acceptsNewLots: accepts,
      });
      onDone(result.message, !editing && printAfter ? [result.id] : undefined);
    } catch (failure) {
      setErrors(describeFailure(failure, ctx));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="lv-setup-card lv-setup-add-bin"
      aria-labelledby="add-bin"
    >
      <h2 id="add-bin">{editing ? `Edit ${editing.code}` : 'Add a bin'}</h2>
      <p className="lv-setup-card-note">
        Name it anything staff will understand.
      </p>
      {!editing && (
        <div
          className="lv-setup-segmented"
          role="group"
          aria-label="How many bins"
        >
          <button
            type="button"
            aria-pressed={mode === 'one'}
            onClick={() => setMode('one')}
          >
            One bin
          </button>
          <button
            type="button"
            aria-pressed={mode === 'many'}
            onClick={() => setMode('many')}
          >
            Several at once
          </button>
        </div>
      )}
      <form
        className="lv-setup-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {mode === 'one' || editing ? (
          <Input
            label="Bin name or code"
            value={code}
            maxLength={20}
            error={errorFor(errors, 'code')}
            hint="Short is best, it goes on the label. e.g. S-06, CAGE-2, FLOOR-2"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        ) : (
          <div className="lv-setup-range">
            <Input
              label="Start of name"
              value={prefix}
              maxLength={12}
              error={errorFor(errors, 'prefix')}
              onChange={(e) => setPrefix(e.target.value.toUpperCase())}
            />
            <div className="lv-setup-range-numbers">
              <Input
                label="Numbers"
                inputMode="numeric"
                value={from}
                onChange={(e) =>
                  setFrom(e.target.value.replace(/\D/g, '').slice(0, 5))
                }
              />
              <span aria-hidden="true">to</span>
              <Input
                label="To"
                inputMode="numeric"
                value={to}
                onChange={(e) =>
                  setTo(e.target.value.replace(/\D/g, '').slice(0, 5))
                }
              />
            </div>
            {preview && (
              <p className="lv-setup-preview" role="status">
                {preview.ok ? (
                  <>
                    Adds {preview.codes.length} bins:{' '}
                    {preview.codes.slice(0, 12).map((c) => (
                      <span
                        key={c}
                        className="lv-setup-chip lv-setup-chip--static"
                      >
                        {c}
                      </span>
                    ))}
                    {preview.codes.length > 12 &&
                      ` +${preview.codes.length - 12} more`}
                  </>
                ) : (
                  <span className="lv-setup-error">{preview.error}</span>
                )}
              </p>
            )}
          </div>
        )}
        <Input
          label="Note for staff (optional)"
          value={note}
          maxLength={120}
          placeholder="e.g. Shelf 6, left wall, phones"
          error={errorFor(errors, 'note')}
          onChange={(e) => setNote(e.target.value)}
        />
        <Input
          label="Holds up to (optional)"
          inputMode="numeric"
          value={limit}
          placeholder="No limit"
          error={errorFor(errors, 'capacity')}
          hint="Leave empty if you don’t want a limit."
          onChange={(e) =>
            setLimit(e.target.value.replace(/\D/g, '').slice(0, 6))
          }
        />
        {editing ? (
          <Switch
            label="Takes new lots"
            checked={accepts}
            onChange={setAccepts}
          />
        ) : (
          <label className="lv-setup-check">
            <input
              type="checkbox"
              checked={printAfter}
              onChange={(e) => setPrintAfter(e.target.checked)}
            />{' '}
            {mode === 'many'
              ? 'Print their QR labels after saving'
              : 'Print its QR label after saving'}
          </label>
        )}
        {errors.form && <p className="lv-setup-error">{errors.form}</p>}
        <div className="lv-setup-actions lv-setup-actions--end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setErrors({});
              setCode('');
              setNote('');
              setLimit('');
              setFrom('');
              setTo('');
              onCancel();
            }}
          >
            Cancel
          </Button>
          {editing && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void printLabels([editing.id])}
            >
              Print label
            </Button>
          )}
          <Button type="submit" busy={busy}>
            {editing
              ? 'Save bin'
              : mode === 'many'
                ? `Add ${preview?.ok ? preview.codes.length : ''} bins`
                : 'Add bin'}
          </Button>
        </div>
      </form>
    </section>
  );
}
