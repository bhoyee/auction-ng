'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  databaseValues,
  formatNaira,
  lotTabs,
  type LotAction,
  type LotListPage,
  type LotListRow,
  type LotSetupOptions,
  type LotTab,
} from '@auction-ng/shared';
import { ApiError } from '@auction-ng/api-client/auth';
import type { LotsClient } from '@auction-ng/api-client/lots';
import { Button } from '@auction-ng/ui/web/button';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Input } from '@auction-ng/ui/web/input';
import {
  ChevronDown,
  Columns3,
  Download,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Table2,
  Upload,
  X,
} from '@auction-ng/ui/web/icons';
import {
  apiMessage,
  BulkDialog,
  DeleteLotDialog,
  downloadText,
  ImportDialog,
  openLiveMonitor,
  openStaffSection,
  MoreFiltersDialog,
  type BulkAction,
  type DeleteTarget,
  type MoreFilterValues,
} from './lot-dialogs';
import { ConditionBadge } from '@auction-ng/ui/web/auction';
import { useLotLabels } from './lot-labels';
import {
  Avatar,
  conditionLabel,
  LotThumb,
  PriceCell,
  stageLabel,
  StatusBadge,
  TimeCell,
  useServerNow,
  wat,
} from './lots-ui';

const tabLabel: Record<LotTab, string> = {
  all: 'All',
  drafts: 'Drafts',
  scheduled: 'Scheduled',
  live: 'Live',
  ending: 'Ending in 24 h',
  sold: 'Sold',
  unsold: 'Unsold',
  archived: 'Archived',
  deleted: 'Deleted',
};
const sortLabel = {
  ending: 'Ending soonest',
  newest: 'Newest',
  price: 'Price',
  bids: 'Most bids',
} as const;
const COLUMNS = [
  ['location', 'Location'],
  ['status', 'Status'],
  ['time', 'Time'],
  ['price', 'Price'],
  ['bids', 'Bids'],
  ['added', 'Added'],
] as const;
type Column = (typeof COLUMNS)[number][0];
// Filters kept in the URL so a filtered list can be shared or reloaded.
const FILTER_KEYS = [
  'tab',
  'search',
  'categoryIds',
  'locationIds',
  'conditions',
  'runTimeMinutes',
  'addedByIds',
  'addedFrom',
  'addedTo',
  'priceMinKobo',
  'priceMaxKobo',
  'supplierIds',
  'binId',
  'sort',
] as const;
type Filters = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

function readUrl(): Filters {
  const params = new URLSearchParams(window.location.search);
  const f: Filters = {};
  for (const k of FILTER_KEYS) {
    const v = params.get(k);
    if (v) f[k] = v;
  }
  // Older links from Lot setup: ?location=…&bin=…
  const location = params.get('location');
  if (location && !f.locationIds) f.locationIds = location;
  const bin = params.get('bin');
  if (bin && !f.binId) f.binId = bin;
  return f;
}

const csvList = (v?: string) => (v ? v.split(',').filter(Boolean) : []);

export function LotsList({
  client,
  options,
  staff,
  permissions,
  online,
  go,
}: {
  client: LotsClient;
  options: LotSetupOptions | undefined;
  staff: { id: string; name: string }[];
  permissions: readonly string[];
  online: boolean;
  go: (path: string) => void;
}) {
  const [filters, setFilters] = useState<Filters>(() => readUrl());
  const [searchText, setSearchText] = useState(filters.search ?? '');
  const [cursor, setCursor] = useState<string>();
  const [pages, setPages] = useState<(string | undefined)[]>([]);
  const [data, setData] = useState<LotListPage>();
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [setup, setSetup] =
    useState<Awaited<ReturnType<LotsClient['setup']>>>();
  const [menu, setMenu] = useState<string>();
  const [toast, setToast] = useState<{ text: string; undo?: () => void }>();
  const [deleting, setDeleting] = useState<DeleteTarget>();
  const [bulk, setBulk] = useState<{ action: BulkAction; ids: string[] }>();
  const [importing, setImporting] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [savingView, setSavingView] = useState(false);
  const [busyExport, setBusyExport] = useState(false);
  const labels = useLotLabels(client);
  const now = useServerNow(data?.serverTime);
  const can = (p: string) => permissions.includes(p);
  const tab = (filters.tab as LotTab) ?? 'all';
  const hidden = new Set(setup?.preferences.hiddenColumns ?? []);
  const layout = setup?.preferences.layout ?? 'table';
  const show = (c: Column) => !hidden.has(c);

  // Keep the URL in step with the filters.
  useEffect(() => {
    const params = new URLSearchParams();
    for (const k of FILTER_KEYS)
      if (filters[k]) params.set(k, filters[k] as string);
    const query = params.toString();
    history.replaceState(null, '', '/lots' + (query ? '?' + query : ''));
  }, [filters]);
  useEffect(() => {
    const t = setTimeout(
      () =>
        setFilters((f) => ({ ...f, search: searchText.trim() || undefined })),
      300,
    );
    return () => clearTimeout(t);
  }, [searchText]);
  useEffect(() => {
    setCursor(undefined);
    setPages([]);
    setSelected(new Set());
  }, [filters]);
  useEffect(() => {
    void client
      .setup()
      .then(setSetup)
      .catch(() => undefined);
  }, [client]);

  // Load the page; background refreshes keep the current rows on screen.
  useEffect(() => {
    let active = true;
    const read = () => {
      if (document.hidden || !navigator.onLine) return;
      client
        .list({ ...filters, cursor, limit: 50 })
        .then((page) => {
          if (!active) return;
          setData(page);
          setError('');
        })
        .catch((failure: unknown) => {
          if (!active) return;
          if (failure instanceof ApiError && failure.status === 401)
            window.dispatchEvent(new Event('lotvanta:staff-unauthorized'));
          setError(
            failure instanceof ApiError && failure.status === 403
              ? 'Your role can’t see this list.'
              : 'Lots couldn’t be loaded.',
          );
        });
    };
    read();
    const timer = setInterval(read, 30_000);
    for (const e of ['focus', 'online', 'lotvanta:staff-refresh'])
      window.addEventListener(e, read);
    return () => {
      active = false;
      clearInterval(timer);
      for (const e of ['focus', 'online', 'lotvanta:staff-refresh'])
        window.removeEventListener(e, read);
    };
  }, [client, filters, cursor, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const set = (patch: Filters) => setFilters((f) => ({ ...f, ...patch }));
  const rows = data?.items ?? [];
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const savePrefs = (
    patch: Partial<NonNullable<typeof setup>['preferences']>,
  ) => {
    if (!setup) return;
    const next = { ...setup.preferences, ...patch };
    setSetup({ ...setup, preferences: next });
    void client.savePreferences(next).catch(() => undefined);
  };

  // Close menus on Escape or outside click.
  const menuRoot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (
        e instanceof MouseEvent &&
        menuRoot.current?.contains(e.target as Node)
      ) {
        const inside = (e.target as HTMLElement).closest('[data-menu]');
        if (inside) return;
      }
      setMenu(undefined);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('mousedown', close);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('mousedown', close);
    };
  }, [menu]);

  const chips = useMemo(() => {
    const out: { key: string; label: string; clear: () => void }[] = [];
    const name = (
      list: { id: string; name: string }[] | undefined,
      id: string,
    ) => list?.find((x) => x.id === id)?.name ?? 'Selected';
    for (const id of csvList(filters.categoryIds))
      out.push({
        key: 'c' + id,
        label: options?.categories.find((c) => c.id === id)?.path ?? 'Category',
        clear: () =>
          set({
            categoryIds:
              csvList(filters.categoryIds)
                .filter((x) => x !== id)
                .join(',') || undefined,
          }),
      });
    for (const id of csvList(filters.locationIds))
      out.push({
        key: 'l' + id,
        label: name(options?.locations, id),
        clear: () =>
          set({
            locationIds:
              csvList(filters.locationIds)
                .filter((x) => x !== id)
                .join(',') || undefined,
          }),
      });
    for (const c of csvList(filters.conditions))
      out.push({
        key: 'k' + c,
        label: conditionLabel(c),
        clear: () =>
          set({
            conditions:
              csvList(filters.conditions)
                .filter((x) => x !== c)
                .join(',') || undefined,
          }),
      });
    if (filters.binId)
      out.push({
        key: 'bin',
        label: filters.binId === 'none' ? 'No bin' : 'Selected bin',
        clear: () => set({ binId: undefined }),
      });
    if (filters.runTimeMinutes)
      out.push({
        key: 'rt',
        label: `${Number(filters.runTimeMinutes) / 60} h run`,
        clear: () => set({ runTimeMinutes: undefined }),
      });
    if (filters.addedByIds)
      out.push({
        key: 'by',
        label: `Added by ${name(staff, filters.addedByIds)}`,
        clear: () => set({ addedByIds: undefined }),
      });
    if (filters.addedFrom || filters.addedTo)
      out.push({
        key: 'date',
        label: `Added ${filters.addedFrom ?? '…'} to ${filters.addedTo ?? '…'}`,
        clear: () => set({ addedFrom: undefined, addedTo: undefined }),
      });
    if (filters.priceMinKobo || filters.priceMaxKobo)
      out.push({
        key: 'price',
        label: `Start ${filters.priceMinKobo ? formatNaira(Number(filters.priceMinKobo)) : '₦0'} – ${filters.priceMaxKobo ? formatNaira(Number(filters.priceMaxKobo)) : 'any'}`,
        clear: () => set({ priceMinKobo: undefined, priceMaxKobo: undefined }),
      });
    if (filters.supplierIds)
      out.push({
        key: 'sup',
        label: name(options?.suppliers, filters.supplierIds),
        clear: () => set({ supplierIds: undefined }),
      });
    return out;
  }, [filters, options, staff]);
  const clearAll = () => {
    setSearchText('');
    setFilters({ tab: filters.tab, sort: filters.sort });
  };

  async function rowAction(row: LotListRow, action: LotAction) {
    setMenu(undefined);
    if (action === 'view') go(`/lots/${row.id}`);
    else if (action === 'edit') go(`/lots/${row.id}/edit`);
    else if (action === 'print-label') void labels.print([row.id]);
    else if (action === 'move') setBulk({ action: 'move', ids: [row.id] });
    else if (action === 'relist')
      openStaffSection('auctions', '/?section=auctions');
    else if (action === 'live-monitor') openLiveMonitor(row.id);
    else if (action === 'delete')
      setDeleting({
        id: row.id,
        lotNumber: row.lotNumber,
        title: row.title,
        stageLabel: stageLabel[row.stage],
        bids: row.bids,
        binCode: row.binCode,
        updatedAt: row.updatedAt,
      });
    else
      try {
        if (action === 'duplicate') {
          const copy = await client.duplicate(row.id, crypto.randomUUID());
          go(`/lots/${copy.id}/edit`);
        } else if (action === 'archive' || action === 'unarchive') {
          const r = await client.archive(
            row.id,
            row.updatedAt,
            action === 'archive',
          );
          refresh();
          setToast({
            text: r.message,
            undo:
              action === 'archive'
                ? () =>
                    void client
                      .editor(row.id)
                      .then((e) => client.archive(row.id, e.updatedAt, false))
                      .then(() => {
                        setToast({
                          text: `${row.lotNumber} is back in the list.`,
                        });
                        refresh();
                      })
                      .catch(() =>
                        setToast({
                          text: 'Undo didn’t work. Use the Archived tab.',
                        }),
                      )
                : undefined,
          });
        } else if (action === 'restore') {
          const r = await client.restore(row.id, row.updatedAt);
          setToast({ text: r.message });
          refresh();
        }
      } catch (failure) {
        setToast({ text: apiMessage(failure, 'That didn’t work. Try again.') });
      }
  }
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), 10_000);
    return () => clearTimeout(t);
  }, [toast]);

  // How many selected lots each bulk action would skip, and why.
  const skips = (action: BulkAction | 'publish' | 'labels') => {
    if (action === 'labels') return 0;
    return selectedRows.filter((r) =>
      action === 'publish'
        ? r.stage !== 'draft'
        : action === 'archive'
          ? !r.actions.includes('archive')
          : action === 'delete'
            ? !r.actions.includes('delete') || r.stage === 'live'
            : !r.actions.includes('edit'),
    ).length;
  };
  const bulkButton = (
    label: string,
    action: BulkAction | 'labels',
    extra: Record<string, string> = {},
  ) => {
    const skip = skips(action);
    return (
      <button
        type="button"
        className="lv-lots-bulkbtn"
        {...extra}
        title={
          skip ? `${skip} of ${selectedRows.length} will be skipped` : undefined
        }
        onClick={() =>
          action === 'labels'
            ? void labels.print(selectedRows.map((r) => r.id))
            : setBulk({ action, ids: selectedRows.map((r) => r.id) })
        }
      >
        {label}
        {skip ? ` (${skip} skipped)` : ''}
      </button>
    );
  };

  const counts = data?.counts;
  const s = data?.summary;
  const visibleTabs = lotTabs.filter(
    (t) => t !== 'deleted' || data?.canSeeDeleted,
  );
  const firstRow = pages.length * 50 + 1;
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / 50));

  return (
    <div className="lv-lots" ref={menuRoot}>
      <p className="lv-lots-crumb">Auctions</p>
      <header className="lv-lots-head">
        <div>
          <h1>Lots</h1>
          <p>
            Every item in stock, from first photo to pickup. Each lot counts
            down from the moment it’s published.
          </p>
        </div>
        <div className="lv-lots-head-actions">
          {can('inventory.write') && (
            <Button variant="secondary" onClick={() => setImporting(true)}>
              <Upload size={16} aria-hidden="true" /> Import CSV
            </Button>
          )}
          <Button
            variant="secondary"
            busy={busyExport}
            onClick={async () => {
              setBusyExport(true);
              try {
                const file = await client.exportCsv({ ...filters });
                downloadText(file.filename, file.csv);
              } catch (failure) {
                setToast({
                  text: apiMessage(failure, 'Export didn’t work. Try again.'),
                });
              } finally {
                setBusyExport(false);
              }
            }}
          >
            <Download size={16} aria-hidden="true" /> Export
          </Button>
          {can('inventory.write') && (
            <Button onClick={() => go('/lots/new')}>
              <Plus size={16} aria-hidden="true" /> Create lot
            </Button>
          )}
        </div>
      </header>

      <section className="lv-lots-kpis" aria-label="Stock summary">
        <div className="lv-lots-kpi">
          <span>In stock</span>
          <b>{s ? s.inStock.toLocaleString('en-NG') : '–'}</b>
          <small>
            Retail value {s ? formatNaira(s.inStockRetailKobo) : '–'}
          </small>
        </div>
        <div className="lv-lots-kpi" data-tone="live">
          <span>Live now</span>
          <b>{s ? s.live.toLocaleString('en-NG') : '–'}</b>
          <small>
            {s
              ? `${s.endingIn24h.toLocaleString('en-NG')} end in the next 24 h`
              : ''}
          </small>
        </div>
        <div className="lv-lots-kpi" data-tone="review">
          <span>Drafts to finish</span>
          <b>{s ? s.drafts.toLocaleString('en-NG') : '–'}</b>
          <small>
            {s?.oldestDraftAt
              ? `Oldest added ${wat.date(s.oldestDraftAt)} · `
              : ''}
            {s && s.drafts > 0 && (
              <button
                type="button"
                className="lv-lots-link"
                onClick={() => set({ tab: 'drafts' })}
              >
                Show drafts
              </button>
            )}
          </small>
        </div>
        <div className="lv-lots-kpi" data-tone="sold">
          <span>Sold, last 30 days</span>
          <b>{s ? s.sold30d.toLocaleString('en-NG') : '–'}</b>
          <small>
            {s
              ? `${formatNaira(s.sold30dHammerKobo)} hammer${s.sold30dRetailKobo ? ` · ${Math.round((s.sold30dHammerKobo / s.sold30dRetailKobo) * 100)}% of retail` : ''}`
              : ''}
          </small>
        </div>
        <div className="lv-lots-kpi" data-tone="unsold">
          <span>Unsold to relist</span>
          <b>{s ? s.unsoldToRelist.toLocaleString('en-NG') : '–'}</b>
          <small>
            {s && s.ended30d
              ? `${Math.round((s.unsold30d / s.ended30d) * 1000) / 10}% of lots that ended`
              : 'of lots that ended'}
          </small>
        </div>
      </section>

      <section className="lv-lots-card">
        <div className="lv-lots-tabs" role="tablist" aria-label="Lot status">
          {visibleTabs.map((t) => (
            <button
              key={t}
              role="tab"
              data-tab={t}
              aria-selected={tab === t && !filters.search}
              onClick={() => set({ tab: t === 'all' ? undefined : t })}
            >
              {tabLabel[t]}
              <span className="lv-lots-count">
                {counts?.[t] !== undefined
                  ? counts[t]?.toLocaleString('en-NG')
                  : '·'}
              </span>
            </button>
          ))}
          {setup?.views.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={false}
              onClick={() => {
                setSearchText(v.query.search ?? '');
                setFilters(v.query);
              }}
            >
              {v.name}
              <span
                role="button"
                tabIndex={0}
                aria-label={`Remove saved view ${v.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void client
                    .deleteView(v.id)
                    .then(() => client.setup().then(setSetup));
                }}
              >
                <X size={14} aria-hidden="true" />
              </span>
            </button>
          ))}
          <button type="button" onClick={() => setSavingView(true)}>
            <Plus size={14} aria-hidden="true" /> Save view
          </button>
        </div>

        <div className="lv-lots-tools">
          <label className="lv-lots-search">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Search lots</span>
            <input
              type="search"
              placeholder="Lot ID, title, bin or supplier"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </label>
          <FilterMenu
            id="category"
            label="Category"
            open={menu === 'category'}
            onOpen={setMenu}
            options={(options?.categories ?? []).map((c) => ({
              id: c.id,
              name: c.path,
            }))}
            value={csvList(filters.categoryIds)}
            onChange={(ids) => set({ categoryIds: ids.join(',') || undefined })}
          />
          <FilterMenu
            id="location"
            label="Pickup location"
            open={menu === 'location'}
            onOpen={setMenu}
            options={(options?.locations ?? []).map((l) => ({
              id: l.id,
              name: `${l.name} · ${l.code}`,
            }))}
            value={csvList(filters.locationIds)}
            onChange={(ids) => set({ locationIds: ids.join(',') || undefined })}
          />
          <FilterMenu
            id="condition"
            label="Condition"
            open={menu === 'condition'}
            onOpen={setMenu}
            options={databaseValues.lotConditions.map((c) => ({
              id: c,
              name: conditionLabel(c),
            }))}
            value={csvList(filters.conditions)}
            onChange={(ids) => set({ conditions: ids.join(',') || undefined })}
          />
          <button
            type="button"
            className="lv-lots-chipbtn"
            onClick={() => setMoreOpen(true)}
          >
            More filters
          </button>
          <div className="lv-lots-viewtools">
            <div className="lv-lots-filter" data-menu>
              <button
                type="button"
                aria-expanded={menu === 'sort'}
                onClick={() => setMenu(menu === 'sort' ? undefined : 'sort')}
              >
                <span>Sort</span>{' '}
                {
                  sortLabel[
                    (filters.sort as keyof typeof sortLabel) ?? 'ending'
                  ]
                }
                <ChevronDown size={16} aria-hidden="true" />
              </button>
              {menu === 'sort' && (
                <div className="lv-lots-menu lv-lots-menu--right" role="menu">
                  {(Object.keys(sortLabel) as (keyof typeof sortLabel)[]).map(
                    (k) => (
                      <button
                        key={k}
                        type="button"
                        role="menuitemradio"
                        aria-checked={(filters.sort ?? 'ending') === k}
                        onClick={() => {
                          set({ sort: k === 'ending' ? undefined : k });
                          setMenu(undefined);
                        }}
                      >
                        {sortLabel[k]}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
            <div className="lv-lots-filter" data-menu>
              <button
                type="button"
                aria-expanded={menu === 'columns'}
                onClick={() =>
                  setMenu(menu === 'columns' ? undefined : 'columns')
                }
              >
                <Columns3 size={16} aria-hidden="true" /> Columns
              </button>
              {menu === 'columns' && (
                <div className="lv-lots-menu lv-lots-menu--right">
                  {COLUMNS.map(([key, label]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={show(key)}
                        onChange={(e) => {
                          const next = new Set(hidden);
                          if (e.target.checked) next.delete(key);
                          else next.add(key);
                          savePrefs({ hiddenColumns: [...next] });
                        }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="lv-lots-toggle" role="group" aria-label="Layout">
              <button
                type="button"
                aria-pressed={layout === 'table'}
                onClick={() => savePrefs({ layout: 'table' })}
              >
                <Table2 size={16} aria-hidden="true" /> Table
              </button>
              <button
                type="button"
                aria-pressed={layout === 'grid'}
                onClick={() => savePrefs({ layout: 'grid' })}
              >
                <LayoutGrid size={16} aria-hidden="true" /> Grid
              </button>
            </div>
          </div>
        </div>

        {(chips.length > 0 || filters.search) && (
          <div className="lv-lots-chips">
            {filters.search && (
              <span className="lv-lots-chip">
                “{filters.search}”
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearchText('')}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </span>
            )}
            {chips.map((c) => (
              <span key={c.key} className="lv-lots-chip">
                {c.label}
                <button
                  type="button"
                  aria-label={`Remove ${c.label}`}
                  onClick={c.clear}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </span>
            ))}
            <button type="button" className="lv-lots-link" onClick={clearAll}>
              Clear all
            </button>
          </div>
        )}

        {toast && (
          <p
            className="lv-lots-toast"
            role="status"
            style={{ margin: '0 16px 12px' }}
          >
            {toast.text}{' '}
            {toast.undo && (
              <button
                type="button"
                className="lv-lots-link"
                onClick={() => {
                  toast.undo?.();
                  setToast(undefined);
                }}
              >
                Undo
              </button>
            )}
          </p>
        )}
        {labels.error && (
          <p
            className="lv-lots-error"
            role="alert"
            style={{ margin: '0 16px 12px' }}
          >
            {labels.error}
          </p>
        )}
        {!online && (
          <p
            className="lv-lots-notice"
            role="status"
            style={{ margin: '0 16px 12px' }}
          >
            You’re offline. The list will refresh when you reconnect.
          </p>
        )}
        {error && data && (
          <p
            className="lv-lots-notice"
            role="status"
            style={{ margin: '0 16px 12px' }}
          >
            Couldn’t refresh. Showing the list from{' '}
            {wat.dateTime(data.serverTime)}.
          </p>
        )}

        {selectedRows.length > 0 && (
          <div
            className="lv-lots-bulk"
            role="region"
            aria-label="Selected lots"
          >
            <strong>{selectedRows.length} selected</strong>
            {selectedRows.length < rows.length && (
              <button
                type="button"
                className="lv-lots-link"
                onClick={() => setSelected(new Set(rows.map((r) => r.id)))}
              >
                Select all {rows.length} on this page
              </button>
            )}
            <span className="lv-lots-spacer" />
            <button
              type="button"
              className="lv-lots-bulkbtn"
              data-publish
              title="Publishing comes in the next step: schedule or publish now from here."
              onClick={() =>
                setToast({
                  text: 'Publishing many lots at once comes next. For now, schedule each lot from its page.',
                })
              }
            >
              Publish…
              {skips('publish') ? ` (${skips('publish')} not drafts)` : ''}
            </button>
            {can('inventory.write') && bulkButton('Edit fields', 'edit')}
            {can('inventory.write') && bulkButton('Move location', 'move')}
            {bulkButton('Print labels', 'labels')}
            {can('records.archive') && bulkButton('Archive', 'archive')}
            {(can('lots.delete') || can('inventory.write')) &&
              bulkButton('Delete', 'delete', { 'data-danger': '' })}
          </div>
        )}

        {!data && !error ? (
          <div
            className="lv-lots-skeleton"
            aria-busy="true"
            aria-label="Loading lots"
          />
        ) : !data ? (
          <div className="lv-lots-state" role="alert">
            <p>{error}</p>
            <Button variant="secondary" onClick={refresh}>
              Try again
            </Button>
          </div>
        ) : !rows.length ? (
          <div className="lv-lots-state">
            {chips.length || filters.search ? (
              <>
                <h3>No lots match these filters.</h3>
                <button
                  type="button"
                  className="lv-lots-link"
                  onClick={clearAll}
                >
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <h3>
                  {tab === 'all'
                    ? 'No lots yet.'
                    : `No ${tabLabel[tab].toLowerCase()} lots.`}
                </h3>
                <p>
                  {tab === 'all' || tab === 'drafts'
                    ? 'Create a lot or import a CSV to start listing stock.'
                    : 'Lots appear here as they move through their auction.'}
                </p>
                {can('inventory.write') &&
                  (tab === 'all' || tab === 'drafts') && (
                    <Button onClick={() => go('/lots/new')}>
                      <Plus size={16} aria-hidden="true" /> Create lot
                    </Button>
                  )}
              </>
            )}
          </div>
        ) : layout === 'grid' ? (
          <div className="lv-lots-grid">
            {rows.map((row) => (
              <article key={row.id} className="lv-lots-tile">
                <input
                  type="checkbox"
                  aria-label={`Select ${row.lotNumber}`}
                  checked={selected.has(row.id)}
                  onChange={() => toggle(row.id)}
                />
                <LotThumb
                  url={row.thumbnailUrl}
                  icon={row.categoryIcon}
                  large
                />
                <button
                  type="button"
                  className="lv-lots-title"
                  onClick={() => go(`/lots/${row.id}`)}
                >
                  {row.title}
                </button>
                <span className="lv-lots-sub">
                  <b>{row.lotNumber}</b> · {row.categoryName}
                </span>
                <StatusBadge row={row} />
                <TimeCell row={row} now={now} />
                <PriceCell row={row} />
              </article>
            ))}
          </div>
        ) : (
          <div className="lv-lots-scroll">
            <table className="lv-lots-table">
              <thead>
                <tr>
                  <th scope="col">
                    <input
                      type="checkbox"
                      aria-label="Select all lots on this page"
                      checked={
                        rows.length > 0 && selectedRows.length === rows.length
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? new Set(rows.map((r) => r.id))
                            : new Set(),
                        )
                      }
                    />
                  </th>
                  <th scope="col">Lot</th>
                  {show('location') && <th scope="col">Location</th>}
                  {show('status') && <th scope="col">Status</th>}
                  {show('time') && <th scope="col">Time</th>}
                  {show('price') && (
                    <th scope="col" className="lv-lots-right">
                      Price
                    </th>
                  )}
                  {show('bids') && (
                    <th scope="col" className="lv-lots-right">
                      Bids
                    </th>
                  )}
                  {show('added') && <th scope="col">Added</th>}
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    data-selected={selected.has(row.id) || undefined}
                  >
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.lotNumber}`}
                        checked={selected.has(row.id)}
                        onChange={() => toggle(row.id)}
                      />
                    </td>
                    <td>
                      <div className="lv-lots-lot">
                        <LotThumb
                          url={row.thumbnailUrl}
                          icon={row.categoryIcon}
                        />
                        <div>
                          <button
                            type="button"
                            className="lv-lots-title"
                            title={row.title}
                            onClick={() => go(`/lots/${row.id}`)}
                          >
                            {row.title}
                          </button>
                          <span className="lv-lots-sub">
                            <b>{row.lotNumber}</b> · {row.categoryName} ·{' '}
                            <ConditionBadge condition={row.condition} />
                          </span>
                        </div>
                      </div>
                    </td>
                    {show('location') && (
                      <td className="lv-lots-nowrap">
                        {row.locationName} ·{' '}
                        {row.binCode ?? (
                          <span className="lv-lots-nobin">no bin</span>
                        )}
                      </td>
                    )}
                    {show('status') && (
                      <td>
                        <StatusBadge row={row} />
                      </td>
                    )}
                    {show('time') && (
                      <td>
                        <TimeCell row={row} now={now} />
                      </td>
                    )}
                    {show('price') && (
                      <td className="lv-lots-right">
                        <PriceCell row={row} />
                      </td>
                    )}
                    {show('bids') && (
                      <td className="lv-lots-right">
                        <div className="lv-lots-price">
                          <b>
                            {['draft', 'scheduled'].includes(row.stage)
                              ? '—'
                              : row.bids}
                          </b>
                          <small>
                            {['draft', 'scheduled'].includes(row.stage)
                              ? 'not live'
                              : `${row.watching} watching`}
                          </small>
                        </div>
                      </td>
                    )}
                    {show('added') && (
                      <td>
                        {row.addedBy ? (
                          <div className="lv-lots-added">
                            <Avatar
                              id={row.addedBy.id}
                              name={row.addedBy.name}
                            />
                            <span>
                              {row.addedBy.name.split(' ')[0]}
                              <small>{wat.date(row.createdAt)}</small>
                            </span>
                          </div>
                        ) : (
                          <span className="lv-lots-sub">
                            {wat.date(row.createdAt)}
                          </span>
                        )}
                      </td>
                    )}
                    <td>
                      <div className="lv-lots-rowacts" data-menu>
                        {row.actions.includes('edit') && (
                          <button
                            type="button"
                            className="lv-lots-iconbtn"
                            aria-label={`Edit ${row.lotNumber}`}
                            onClick={() => go(`/lots/${row.id}/edit`)}
                          >
                            <Pencil size={16} aria-hidden="true" />
                          </button>
                        )}
                        <button
                          type="button"
                          className="lv-lots-iconbtn"
                          aria-label={`More actions for ${row.lotNumber}`}
                          aria-expanded={menu === 'row:' + row.id}
                          onClick={() =>
                            setMenu(
                              menu === 'row:' + row.id
                                ? undefined
                                : 'row:' + row.id,
                            )
                          }
                        >
                          <MoreHorizontal size={18} aria-hidden="true" />
                        </button>
                        {menu === 'row:' + row.id && (
                          <RowMenu
                            row={row}
                            onAction={(a) => void rowAction(row, a)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && rows.length > 0 && (
          <div className="lv-lots-foot">
            <span>
              Showing {firstRow.toLocaleString('en-NG')}–
              {(firstRow + rows.length - 1).toLocaleString('en-NG')} of{' '}
              {data.total.toLocaleString('en-NG')} · 50 per page
            </span>
            <nav aria-label="Lot pages">
              <Button
                variant="secondary"
                size="small"
                disabled={!pages.length}
                onClick={() => {
                  setCursor(pages.at(-1));
                  setPages((p) => p.slice(0, -1));
                }}
              >
                Previous
              </Button>
              <span>
                Page {pages.length + 1} of {pageCount}
              </span>
              <Button
                variant="secondary"
                size="small"
                disabled={!data.nextCursor}
                onClick={() => {
                  setPages((p) => [...p, cursor]);
                  setCursor(data.nextCursor ?? undefined);
                }}
              >
                Next
              </Button>
            </nav>
          </div>
        )}
      </section>

      {labels.sheet}
      {deleting && (
        <DeleteLotDialog
          target={deleting}
          client={client}
          onClose={() => setDeleting(undefined)}
          onDone={(message) => {
            setDeleting(undefined);
            setToast({ text: message });
            refresh();
          }}
        />
      )}
      {bulk && (
        <BulkDialog
          action={bulk.action}
          ids={bulk.ids}
          options={options}
          client={client}
          onClose={() => setBulk(undefined)}
          onDone={() => {
            setSelected(new Set());
            refresh();
          }}
        />
      )}
      {importing && (
        <ImportDialog
          client={client}
          options={options}
          onClose={() => setImporting(false)}
          onImported={(message) => {
            setImporting(false);
            setToast({ text: message });
            set({ tab: 'drafts' });
          }}
        />
      )}
      {moreOpen && (
        <MoreFiltersDialog
          values={filters as MoreFilterValues}
          options={options}
          staff={staff}
          onClose={() => setMoreOpen(false)}
          onApply={(v) => {
            setMoreOpen(false);
            set({
              runTimeMinutes: v.runTimeMinutes,
              addedByIds: v.addedByIds,
              addedFrom: v.addedFrom,
              addedTo: v.addedTo,
              priceMinKobo: v.priceMinKobo,
              priceMaxKobo: v.priceMaxKobo,
              supplierIds: v.supplierIds,
            });
          }}
        />
      )}
      {savingView && (
        <SaveViewDialog
          onClose={() => setSavingView(false)}
          onSave={async (name) => {
            const q: Record<string, string> = {};
            for (const k of FILTER_KEYS)
              if (filters[k]) q[k] = filters[k] as string;
            await client.saveView(name, q);
            setSetup(await client.setup());
            setSavingView(false);
          }}
        />
      )}
    </div>
  );

  function toggle(id: string) {
    setSelected((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
}

const actionLabel: Partial<Record<LotAction, [string, string?]>> = {
  view: ['View lot', 'Enter'],
  edit: ['Edit', 'E'],
  duplicate: ['Duplicate', 'D'],
  'print-label': ['Print label'],
  move: ['Move to another bin or hub'],
  'live-monitor': ['Open in Live monitor'],
  relist: ['Relist in Unsold review'],
  archive: ['Archive'],
  unarchive: ['Take out of archive'],
  restore: ['Restore'],
  delete: ['Delete'],
};

/** The ⋯ menu lists only what this person can do to this lot. */
function RowMenu({
  row,
  onAction,
}: {
  row: LotListRow;
  onAction: (a: LotAction) => void;
}) {
  const first = row.actions.filter(
    (a) => !['archive', 'unarchive', 'delete', 'restore'].includes(a),
  );
  const last = row.actions.filter((a) =>
    ['archive', 'unarchive', 'delete', 'restore'].includes(a),
  );
  return (
    <div
      className="lv-lots-menu lv-lots-menu--right"
      role="menu"
      onKeyDown={(e) => {
        const key = e.key.toLowerCase();
        if (key === 'e' && row.actions.includes('edit')) onAction('edit');
        if (key === 'd' && row.actions.includes('duplicate'))
          onAction('duplicate');
        if (key === 'enter' && (e.target as HTMLElement).tagName !== 'BUTTON')
          onAction('view');
      }}
    >
      {first.map((a) => (
        <button
          key={a}
          type="button"
          role="menuitem"
          onClick={() => onAction(a)}
        >
          {actionLabel[a]?.[0]}
          {actionLabel[a]?.[1] && <kbd>{actionLabel[a]?.[1]}</kbd>}
        </button>
      ))}
      {last.length > 0 && <hr />}
      {last.map((a) => (
        <button
          key={a}
          type="button"
          role="menuitem"
          data-danger={a === 'delete' || undefined}
          onClick={() => onAction(a)}
        >
          {actionLabel[a]?.[0]}
        </button>
      ))}
    </div>
  );
}

function FilterMenu({
  id,
  label,
  open,
  onOpen,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  open: boolean;
  onOpen: (id: string | undefined) => void;
  options: { id: string; name: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="lv-lots-filter" data-menu>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onOpen(open ? undefined : id)}
      >
        {label} <span>{value.length ? `${value.length} selected` : 'All'}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="lv-lots-menu" role="group" aria-label={label}>
          {options.length === 0 && (
            <span className="lv-lots-sub">Nothing to choose yet.</span>
          )}
          {options.map((o) => (
            <label key={o.id}>
              <input
                type="checkbox"
                checked={value.includes(o.id)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...value, o.id]
                      : value.filter((v) => v !== o.id),
                  )
                }
              />
              {o.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function SaveViewDialog({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Dialog open onClose={onClose} title="Save this view">
      <form
        className="lv-lots-dialog"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await onSave(name.trim());
          } catch (failure) {
            setError(apiMessage(failure, 'The view couldn’t be saved.'));
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          Saves the current tab, filters and sort as your own tab, e.g. “Needs
          photos”.
        </p>
        <Input
          label="Name"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
        />
        {error && <p className="lv-lots-error">{error}</p>}
        <div className="lv-lots-dialog-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy} disabled={!name.trim()}>
            Save view
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
