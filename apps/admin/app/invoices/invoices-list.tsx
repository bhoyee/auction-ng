'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  invoicePaymentLabels,
  invoicePaymentStates,
  invoiceTabs,
  type InvoiceTab,
} from '@auction-ng/shared';
import type { InvoicesClient } from '@auction-ng/api-client/invoices';
import { Button } from '@auction-ng/ui/web/button';
import { Search } from '@auction-ng/ui/web/icons';
import {
  fieldErrors,
  LoadState,
  Pager,
  todayWat,
  useBatchLoad,
  useCursor,
} from '../batches/batch-ui';
import { InvoiceDrawer } from './invoice-drawer';
import {
  money,
  nairaValue,
  onDay,
  PaymentBadge,
  PickupBadge,
} from './invoice-ui';

const tabLabels: Record<InvoiceTab, string> = {
  all: 'All',
  not_collected: 'Paid, not collected',
  refund_pending: 'Refund pending',
  refunded: 'Refunded',
  disputed: 'Disputed',
};
const emptyText: Record<InvoiceTab, string> = {
  all: 'No invoices in these dates.',
  not_collected: 'Everything paid has been collected. Nice.',
  refund_pending: 'No refunds waiting. Nice.',
  refunded: 'No refunds in these dates.',
  disputed: 'No open disputes. Nice.',
};
const ranges = [
  ['7', 'Last 7 days'],
  ['30', 'Last 30 days'],
  ['90', 'Last 90 days'],
  ['all', 'All time'],
  ['custom', 'Choose dates'],
] as const;
const daysAgo = (days: number) =>
  new Date(Date.now() + 3_600_000 - (days - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);

export function InvoicesList({
  client,
  locations,
  online,
  selected,
  onSelect,
  onOpen,
}: {
  client: InvoicesClient;
  locations: { id: string; name: string }[];
  online: boolean;
  selected?: string;
  onSelect: (number?: string) => void;
  onOpen: (number: string) => void;
}) {
  const [tab, setTab] = useState<InvoiceTab>('all');
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<(typeof ranges)[number][0]>('7');
  const [customFrom, setCustomFrom] = useState(daysAgo(7));
  const [customTo, setCustomTo] = useState(todayWat);
  const [payment, setPayment] = useState('');
  const [locationIds, setLocation] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [problem, setProblem] = useState('');
  const [exporting, setExporting] = useState(false);
  const pager = useCursor();
  useEffect(() => {
    const timer = setTimeout(() => setSearch(text.trim()), 250);
    return () => clearTimeout(timer);
  }, [text]);
  const filters = {
    tab,
    search,
    // A search looks at every date.
    from:
      search || range === 'all'
        ? undefined
        : range === 'custom'
          ? customFrom
          : daysAgo(Number(range)),
    to: search || range !== 'custom' ? undefined : customTo,
    payment,
    locationIds,
    minKobo: nairaValue(min),
    maxKobo: nairaValue(max),
  };
  const key = JSON.stringify(filters);
  const { reset } = pager;
  useEffect(() => reset(), [key, reset]);
  const page = useBatchLoad(
    () => client.list({ ...filters, cursor: pager.cursor }),
    [client, key, pager.cursor],
  );
  const data = page.data;
  const rows = data?.items ?? [];
  const filtered = search || payment || locationIds || min || max;
  const step = useCallback(
    (by: 1 | -1) => {
      const at = rows.findIndex((r) => r.number === selected);
      const next = rows[at + by];
      if (at >= 0 && next) {
        onSelect(next.number);
        document
          .getElementById(`invoice-${next.number}`)
          ?.scrollIntoView({ block: 'nearest' });
      }
    },
    [rows, selected, onSelect],
  );
  const close = useCallback(() => onSelect(undefined), [onSelect]);
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
  return (
    <section
      className="lv-inv"
      data-drawer={selected ? '' : undefined}
      aria-labelledby="lv-inv-title"
    >
      <div className="lv-inv-main">
        <header className="lv-setup-head">
          <div>
            <p className="lv-setup-eyebrow">Orders</p>
            <h1 id="lv-inv-title">Invoices</h1>
          </div>
          <div className="lv-setup-head-actions lv-inv-range">
            <select
              className="agn-input"
              aria-label="Dates"
              value={range}
              onChange={(e) => setRange(e.target.value as typeof range)}
            >
              {ranges.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {range === 'custom' && (
              <>
                <input
                  type="date"
                  className="agn-input"
                  aria-label="From"
                  value={customFrom}
                  max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
                <input
                  type="date"
                  className="agn-input"
                  aria-label="To"
                  value={customTo}
                  min={customFrom}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </>
            )}
            <Button
              variant="secondary"
              busy={exporting}
              disabled={!online || !rows.length}
              onClick={() => void exportCsv()}
            >
              Export
            </Button>
          </div>
        </header>
        <section className="lv-setup-card lv-setup-card--flush">
          <nav
            className="lv-setup-tabs lv-batch-tabs"
            aria-label="Invoice tabs"
          >
            {invoiceTabs.map((value) => (
              <button
                key={value}
                type="button"
                aria-current={value === tab ? 'page' : undefined}
                onClick={() => setTab(value)}
              >
                {tabLabels[value]}
                <span className="lv-setup-tab-count">
                  {data ? data.counts[value].toLocaleString('en-NG') : '–'}
                </span>
              </button>
            ))}
          </nav>
          <div className="lv-setup-table-tools lv-batch-filters">
            <label className="lv-setup-search">
              <Search size={18} aria-hidden="true" />
              <span className="sr-only">Search invoices</span>
              <input
                type="search"
                placeholder="Invoice number, buyer name or phone"
                title="Type the whole phone number to find it"
                value={text}
                maxLength={100}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <select
              className="agn-input"
              aria-label="Status"
              value={payment}
              onChange={(e) => setPayment(e.target.value)}
            >
              <option value="">Any status</option>
              {invoicePaymentStates.map((s) => (
                <option key={s} value={s}>
                  {invoicePaymentLabels[s]}
                </option>
              ))}
            </select>
            <select
              className="agn-input"
              aria-label="Location"
              value={locationIds}
              onChange={(e) => setLocation(e.target.value)}
            >
              <option value="">Any location</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <div className="lv-batch-date lv-inv-amount">
              ₦
              <input
                className="agn-input"
                inputMode="decimal"
                aria-label="Amount from"
                placeholder="From"
                value={min}
                onChange={(e) => setMin(e.target.value)}
              />
              to
              <input
                className="agn-input"
                inputMode="decimal"
                aria-label="Amount to"
                placeholder="To"
                value={max}
                onChange={(e) => setMax(e.target.value)}
              />
            </div>
          </div>
          {problem && (
            <p className="lv-setup-alert" role="alert">
              {problem}
            </p>
          )}
          {(!online || (page.error && data)) && (
            <p className="lv-setup-inline-note" role="status">
              {online
                ? 'Couldn’t refresh. Showing the last list.'
                : 'You’re offline. Showing the last list.'}
            </p>
          )}
          {!data ? (
            <LoadState error={page.error} onRetry={page.reload} rows />
          ) : !rows.length ? (
            <div className="lv-setup-state">
              {filtered ? (
                <p>
                  No invoices match.{' '}
                  <button
                    type="button"
                    className="lv-setup-link"
                    onClick={() => {
                      setText('');
                      setSearch('');
                      setPayment('');
                      setLocation('');
                      setMin('');
                      setMax('');
                    }}
                  >
                    Clear filters
                  </button>
                </p>
              ) : (
                <p>{emptyText[tab]}</p>
              )}
            </div>
          ) : (
            <div className="lv-setup-scroll">
              <table className="lv-setup-table lv-batch-table lv-inv-table">
                <thead>
                  <tr>
                    <th scope="col">Invoice</th>
                    <th scope="col">Buyer</th>
                    <th scope="col" className="lv-setup-right">
                      Lots
                    </th>
                    <th scope="col" className="lv-setup-right">
                      Hammer
                    </th>
                    <th scope="col" className="lv-setup-right">
                      Fees + VAT
                    </th>
                    <th scope="col" className="lv-setup-right">
                      Total
                    </th>
                    <th scope="col">Payment</th>
                    <th scope="col">Pickup</th>
                    <th scope="col">Issued</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      id={`invoice-${r.number}`}
                      data-active={r.number === selected ? '' : undefined}
                      onClick={() => onSelect(r.number)}
                    >
                      <td>
                        <button
                          type="button"
                          className="lv-batch-code"
                          aria-current={
                            r.number === selected ? 'true' : undefined
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelect(r.number);
                          }}
                        >
                          {r.number}
                        </button>
                      </td>
                      <td>
                        {r.buyerName}
                        {r.phone && <small>{r.phone}</small>}
                      </td>
                      <td className="lv-setup-right">{r.lots}</td>
                      <td className="lv-setup-right">{money(r.hammerKobo)}</td>
                      <td className="lv-setup-right">{money(r.feesKobo)}</td>
                      <td className="lv-setup-right">
                        <b>{money(r.totalKobo)}</b>
                      </td>
                      <td>
                        <PaymentBadge state={r.payment} />
                      </td>
                      <td>
                        <PickupBadge state={r.pickup} />
                      </td>
                      <td className="lv-batch-nowrap">{onDay(r.issuedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager
            label="Invoice pages"
            page={pager.page}
            next={!!data?.nextCursor}
            onPrevious={pager.previous}
            onNext={() => pager.next(data?.nextCursor)}
          />
        </section>
      </div>
      {selected && (
        <InvoiceDrawer
          number={selected}
          client={client}
          onClose={close}
          onStep={step}
          onOpenPage={() => onOpen(selected)}
          onChanged={page.reload}
        />
      )}
    </section>
  );
}
