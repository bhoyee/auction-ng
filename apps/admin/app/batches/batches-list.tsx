'use client';
import { useEffect, useRef, useState } from 'react';
import {
  batchStatuses,
  batchStatusLabels,
  batchTabs,
  type BatchRow,
  type BatchTab,
  type LotSetupOptions,
} from '@auction-ng/shared';
import type { BatchesClient } from '@auction-ng/api-client/batches';
import type { createLotsClient } from '@auction-ng/api-client/lots';
import { Button } from '@auction-ng/ui/web/button';
import { Plus, Search } from '@auction-ng/ui/web/icons';
import { BatchPanel } from './batch-panel';
import {
  BatchStatusPill,
  fieldErrors,
  LoadState,
  Margin,
  Pager,
  PercentBar,
  shortDay,
  shortNaira,
  useBatchLoad,
  useCursor,
} from './batch-ui';

const tabLabels: Record<BatchTab, string> = {
  open: 'Open',
  arriving: 'Arriving',
  closed: 'Closed',
  all: 'All',
  deleted: 'Deleted',
};
const receivedText = (b: BatchRow) =>
  b.receivedOn
    ? shortDay(b.receivedOn)
    : b.expectedOn
      ? `Due ${shortDay(b.expectedOn)}`
      : '—';

export function BatchesList({
  client,
  lots,
  options,
  selectedId,
  online,
  canSeeSuppliers,
  onSuppliers,
  go,
}: {
  client: BatchesClient;
  lots?: ReturnType<typeof createLotsClient>;
  options?: LotSetupOptions;
  selectedId?: string;
  online: boolean;
  canSeeSuppliers: boolean;
  onSuppliers: () => void;
  go: (path: string, top?: boolean) => void;
}) {
  const [tab, setTab] = useState<BatchTab>(selectedId ? 'all' : 'open');
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [supplierIds, setSupplier] = useState('');
  const [locationIds, setLocation] = useState('');
  const [status, setStatus] = useState('');
  const [receivedFrom, setFrom] = useState('');
  const [receivedTo, setTo] = useState('');
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');
  const [exporting, setExporting] = useState(false);
  const [revealRequest, setRevealRequest] = useState(0);
  const tabs = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = tabs.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && active) nav.scrollLeft = active.offsetLeft - nav.offsetLeft;
  }, [tab]);
  const showBatch = (id: string) => {
    setRevealRequest((request) => request + 1);
    go(`/batches/${id}`, false);
  };
  const pager = useCursor();
  useEffect(() => {
    const timer = setTimeout(() => setSearch(text.trim()), 250);
    return () => clearTimeout(timer);
  }, [text]);
  const filters = {
    tab,
    search,
    supplierIds,
    locationIds,
    status,
    receivedFrom,
    receivedTo,
  };
  const filterKey = JSON.stringify(filters);
  const { reset } = pager;
  useEffect(() => reset(), [filterKey, reset]);
  const page = useBatchLoad(
    () => client.list({ ...filters, cursor: pager.cursor, limit: 20 }),
    [client, filterKey, pager.cursor],
  );
  const data = page.data;
  const rows = data?.items ?? [];
  const money = data?.canSeeCosts ?? false;
  // The newest batch that is selling is shown until another is chosen.
  const selected =
    selectedId ?? (rows.find((b) => b.status === 'selling') ?? rows[0])?.id;
  const filtered =
    search ||
    supplierIds ||
    locationIds ||
    status ||
    receivedFrom ||
    receivedTo;
  async function exportCsv() {
    setExporting(true);
    setProblem('');
    try {
      const file = await client.export(filters);
      const url = URL.createObjectURL(
        new Blob([file.csv], { type: 'text/csv;charset=utf-8' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (failure) {
      setProblem(
        Object.values(fieldErrors(failure))[0] ?? 'The export failed.',
      );
    } finally {
      setExporting(false);
    }
  }
  const cards = data?.cards;
  return (
    <section className="lv-batches" aria-labelledby="lv-batches-title">
      <header className="lv-setup-head">
        <div>
          <p className="lv-setup-eyebrow">Auctions</p>
          <h1 id="lv-batches-title">Inventory batches</h1>
          <p className="lv-setup-description">
            Stock you bought, what it cost and how much of it has come back
          </p>
        </div>
        <div className="lv-setup-head-actions">
          {canSeeSuppliers && (
            <Button variant="secondary" onClick={onSuppliers}>
              Suppliers
            </Button>
          )}
          {data?.canManage && (
            <Button onClick={() => go('/batches/new')}>
              <Plus size={18} aria-hidden="true" /> Add batch
            </Button>
          )}
        </div>
      </header>
      {notice && (
        <p className="lv-setup-toast" role="status">
          {notice}
        </p>
      )}

      <div className="lv-batch-kpis">
        {money && (
          <div className="lv-batch-kpi">
            <span>Unsold stock at cost</span>
            <b>{cards ? shortNaira(cards.unsoldCostKobo ?? 0) : '–'}</b>
            <small>
              {cards
                ? `${cards.unsoldLots.toLocaleString('en-NG')} lots in ${cards.unsoldLocations} ${cards.unsoldLocations === 1 ? 'location' : 'locations'}`
                : 'Loading'}
            </small>
          </div>
        )}
        <div className="lv-batch-kpi">
          <span>Open batches</span>
          <b>{cards ? cards.openBatches.toLocaleString('en-NG') : '–'}</b>
          <small>
            {cards ? `${cards.arrivingThisWeek} arriving this week` : 'Loading'}
          </small>
        </div>
        {money && (
          <div className="lv-batch-kpi">
            <span>Average recovery</span>
            <b>
              {cards?.averageRecoveryPercent == null
                ? '—'
                : `${cards.averageRecoveryPercent}%`}
            </b>
            <small>money back ÷ cost, closed batches</small>
          </div>
        )}
        <div className="lv-batch-kpi">
          <span>Oldest unsold lot</span>
          <b>
            {cards?.oldestUnsold
              ? `${cards.oldestUnsold.days} ${cards.oldestUnsold.days === 1 ? 'day' : 'days'}`
              : '—'}
          </b>
          <small>
            {cards?.oldestUnsold
              ? `${cards.oldestUnsold.batchCode} · ${cards.oldestUnsold.locationName}`
              : 'No unsold lots'}
          </small>
        </div>
      </div>

      <section className="lv-setup-card lv-setup-card--flush">
        <div className="lv-batch-card-head">
          <div>
            <h2>Batches</h2>
            {money && (
              <p>
                Margin so far = money back from sold lots (hammer + buyer’s
                premium) − batch cost
              </p>
            )}
          </div>
          <Button
            variant="secondary"
            size="small"
            busy={exporting}
            disabled={!online || !rows.length || tab === 'deleted'}
            onClick={() => void exportCsv()}
          >
            Export
          </Button>
        </div>
        <nav
          ref={tabs}
          className="lv-setup-tabs lv-batch-tabs"
          aria-label="Batch status"
        >
          {batchTabs
            .filter((key) => key !== 'deleted' || data?.canManage)
            .map((key) => (
              <button
                key={key}
                type="button"
                aria-current={key === tab ? 'page' : undefined}
                onClick={() => {
                  setTab(key);
                  go('/batches', false);
                }}
              >
                {tabLabels[key]}
                <span className="lv-setup-tab-count">
                  {data ? data.counts[key].toLocaleString('en-NG') : '–'}
                </span>
              </button>
            ))}
        </nav>
        <div className="lv-setup-table-tools lv-batch-filters">
          <label className="lv-setup-search">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Search batches</span>
            <input
              type="search"
              placeholder="Batch, name or supplier"
              value={text}
              maxLength={100}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <select
            className="agn-input"
            aria-label="Supplier"
            value={supplierIds}
            onChange={(e) => setSupplier(e.target.value)}
          >
            <option value="">Any supplier</option>
            {options?.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            className="agn-input"
            aria-label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Any status</option>
            {batchStatuses.map((s) => (
              <option key={s} value={s}>
                {batchStatusLabels[s]}
              </option>
            ))}
          </select>
          <select
            className="agn-input"
            aria-label="Pickup location"
            value={locationIds}
            onChange={(e) => setLocation(e.target.value)}
          >
            <option value="">Any location</option>
            {options?.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <div className="lv-batch-date">
            Received
            <input
              type="date"
              className="agn-input"
              aria-label="Received from"
              value={receivedFrom}
              max={receivedTo || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
            to
            <input
              type="date"
              className="agn-input"
              aria-label="Received to"
              value={receivedTo}
              min={receivedFrom || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        {problem && (
          <p className="lv-setup-alert" role="alert">
            {problem}
          </p>
        )}
        {!online && (
          <p className="lv-setup-inline-note" role="status">
            You’re offline. Showing the last numbers.
          </p>
        )}
        {page.error && data && (
          <p className="lv-setup-inline-note" role="status">
            Couldn’t refresh. Showing the last numbers.
          </p>
        )}
        {!data ? (
          <LoadState error={page.error} onRetry={page.reload} rows />
        ) : !rows.length ? (
          <div className="lv-setup-state">
            {filtered ? (
              <p>
                No batches match.{' '}
                <button
                  type="button"
                  className="lv-setup-link"
                  onClick={() => {
                    setText('');
                    setSearch('');
                    setSupplier('');
                    setLocation('');
                    setStatus('');
                    setFrom('');
                    setTo('');
                  }}
                >
                  Clear filters
                </button>
              </p>
            ) : tab === 'open' ? (
              <>
                <h2>No open batches. Add the first one.</h2>
                <p>Lots can’t be created until their batch is added.</p>
                {data.canManage && (
                  <Button onClick={() => go('/batches/new')}>Add batch</Button>
                )}
              </>
            ) : (
              <p>No batches here.</p>
            )}
          </div>
        ) : (
          <div className="lv-setup-scroll">
            <table className="lv-setup-table lv-batch-table">
              <thead>
                <tr>
                  <th scope="col">Batch</th>
                  <th scope="col">Supplier</th>
                  <th scope="col">Received</th>
                  {money && (
                    <th scope="col" className="lv-setup-right">
                      Cost
                    </th>
                  )}
                  <th scope="col" className="lv-setup-right">
                    Items
                  </th>
                  <th scope="col">Intaken</th>
                  <th scope="col">Sold</th>
                  {money && (
                    <>
                      <th scope="col" className="lv-setup-right">
                        Money back so far
                      </th>
                      <th scope="col" className="lv-setup-right">
                        Margin so far
                      </th>
                    </>
                  )}
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr
                    key={b.id}
                    data-active={b.id === selected ? '' : undefined}
                    onClick={() => showBatch(b.id)}
                  >
                    <td>
                      <button
                        type="button"
                        className="lv-batch-code"
                        aria-current={b.id === selected ? 'true' : undefined}
                        aria-label={`Show ${b.code}, ${b.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          showBatch(b.id);
                        }}
                      >
                        {b.code}
                      </button>
                    </td>
                    <td>
                      {b.supplierName}
                      <small>{b.name}</small>
                    </td>
                    <td className="lv-batch-nowrap">{receivedText(b)}</td>
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
                    <td>
                      <PercentBar
                        value={b.intakenPercent}
                        tone="indigo"
                        label={`${b.code} intaken`}
                      />
                    </td>
                    <td>
                      <PercentBar
                        value={b.soldPercent}
                        tone="teal"
                        label={`${b.code} sold`}
                      />
                    </td>
                    {money && (
                      <>
                        <td className="lv-setup-right">
                          {b.status === 'arriving'
                            ? '—'
                            : shortNaira(b.moneyBackKobo ?? 0)}
                        </td>
                        <td className="lv-setup-right">
                          <Margin
                            kobo={b.status === 'arriving' ? null : b.marginKobo}
                          />
                        </td>
                      </>
                    )}
                    <td>
                      <BatchStatusPill
                        status={b.status}
                        deletedAt={b.deletedAt}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager
          label="Batch pages"
          page={pager.page}
          next={!!data?.nextCursor}
          onPrevious={pager.previous}
          onNext={() => pager.next(data?.nextCursor)}
        />
      </section>
      {selected && (
        <BatchPanel
          key={selected}
          id={selected}
          reveal={Boolean(selectedId)}
          revealRequest={revealRequest}
          client={client}
          lots={lots}
          online={online}
          go={go}
          onChanged={page.reload}
          onDeletionChanged={(action, message) => {
            setNotice(message);
            setTab(action === 'delete' ? 'deleted' : 'arriving');
            setRevealRequest((request) => request + 1);
            go(`/batches/${selected}`, false);
            page.reload();
          }}
        />
      )}
    </section>
  );
}
