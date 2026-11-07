'use client';
export { Download, ScanLine } from 'lucide-react';
import type { TooltipContentProps } from 'recharts';
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Info,
  MoreHorizontal,
  TriangleAlert,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  deltaIsGood,
  formatNaira,
  metricChange,
  overviewMetrics,
  type OverviewData,
  type OverviewMetric,
  type OverviewResponse,
} from '@auction-ng/shared';

const DemoSource = createContext(false);
export type WidgetState = {
  value?: OverviewResponse;
  error: string;
  loading: boolean;
  retry: () => void;
};
export const number = (value: number) =>
  new Intl.NumberFormat('en-NG').format(value);
export const compactMoney = (value: number) =>
  '₦' +
  new Intl.NumberFormat('en-NG', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value / 100);
function MetricValue({
  children,
  onClick,
}: {
  children: string;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const fit = () => {
      element.style.fontSize = '';
      const size = Number.parseFloat(getComputedStyle(element).fontSize);
      if (element.scrollWidth > element.clientWidth)
        element.style.fontSize = `${Math.max(13, Math.floor((size * element.clientWidth) / element.scrollWidth))}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    void document.fonts.ready.then(fit);
    return () => observer.disconnect();
  }, [children]);
  return (
    <button
      type="button"
      ref={ref}
      className="lv-admin-kpi-value"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export function exportRows(
  name: string,
  columns: string[],
  rows: (string | number | null)[][],
) {
  const escape = (v: string | number | null) => {
    const value = String(v ?? '');
    return (
      '"' +
      (typeof v === 'string' && /^[=+\-@\t\r\n]/.test(value) ? "'" : '') +
      value.replaceAll('"', '""') +
      '"'
    );
  };
  const content = [columns, ...rows]
    .map((row) => row.map(escape).join(','))
    .join('\r\n');
  const url = URL.createObjectURL(
    new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'lotvanta-' + name + '.csv';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function WidgetFrame({
  title,
  subtitle,
  state,
  children,
  action,
  className = '',
}: {
  title: string;
  subtitle?: string;
  state: WidgetState;
  children: (data: OverviewData) => ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const data = state.value?.data;
  return (
    <DemoSource.Provider value={state.value?.mode === 'demo'}>
      <section className={'lv-admin-widget ' + className} aria-label={title}>
        <header>
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="lv-admin-widget-actions">
            {state.value?.mode === 'demo' && (
              <span className="lv-admin-demo-chip">Demo</span>
            )}
            {action}
          </div>
        </header>
        {state.error && (
          <div className="lv-admin-widget-error" role="alert">
            Couldn’t load ·{' '}
            <button type="button" onClick={state.retry}>
              Retry
            </button>
            {data && <small>Last confirmed snapshot shown.</small>}
          </div>
        )}
        {data ? (
          children(data)
        ) : state.loading ? (
          <div
            className="lv-admin-widget-skeleton"
            role="status"
            aria-label={'Loading ' + title}
          >
            <span />
            <span />
            <span />
          </div>
        ) : !state.error ? (
          <div className="lv-admin-widget-empty">
            <Info size={22} />
            <strong>Data not available yet</strong>
            <p>
              {state.value?.message ??
                'The source for this widget is not configured.'}
            </p>
          </div>
        ) : null}
      </section>
    </DemoSource.Provider>
  );
}
export function Sparkline({
  values,
  label,
  comparison = false,
}: {
  values: number[];
  label: string;
  comparison?: boolean;
}) {
  const low = Math.min(...values),
    high = Math.max(...values);
  const points = values
    .map(
      (v, i) =>
        `${4 + (i / Math.max(1, values.length - 1)) * 144},${30 - ((v - low) / Math.max(1, high - low)) * 26}`,
    )
    .join(' ');
  return (
    <svg
      viewBox="0 0 152 34"
      role="img"
      aria-label={label}
      className={'lv-admin-sparkline' + (comparison ? ' is-comparison' : '')}
    >
      <polyline points={points} />
    </svg>
  );
}
export function MetricDelta({
  id,
  value,
  previous,
}: {
  id: OverviewMetric;
  value: number;
  previous: number | null;
}) {
  const delta = metricChange(value, previous);
  if (delta === null)
    return (
      <span className="lv-admin-delta is-neutral">
        — <small>No comparable period</small>
      </span>
    );
  return (
    <span
      className={
        'lv-admin-delta ' + (deltaIsGood(id, delta) ? 'is-good' : 'is-bad')
      }
    >
      {delta >= 0 ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
      {Math.abs(delta).toFixed(1)}% <small>vs prev.</small>
    </span>
  );
}
export function KpiGrid({
  state,
  onReport,
}: {
  state: WidgetState;
  onReport: (id: OverviewMetric) => void;
}) {
  return (
    <div className="lv-admin-kpis">
      {Object.entries(overviewMetrics).map(([key, metric]) => {
        const id = key as OverviewMetric;
        const point = state.value?.data?.kpis.find((row) => row.id === id);
        return (
          <section className="lv-admin-kpi" key={id} aria-label={metric.label}>
            <div className="lv-admin-kpi-label">
              <span>{metric.label}</span>
              <button
                type="button"
                aria-label={metric.label + ' definition'}
                title={metric.definition}
              >
                <Info size={14} />
              </button>
            </div>
            {point ? (
              <>
                <MetricValue onClick={() => onReport(id)}>
                  {metric.format === 'money'
                    ? formatNaira(point.value)
                    : metric.format === 'percent'
                      ? (point.value / 100).toFixed(1) + '%'
                      : number(point.value)}
                </MetricValue>
                {point.previous !== null && (
                  <MetricDelta
                    id={id}
                    value={point.value}
                    previous={point.previous}
                  />
                )}
                <Sparkline
                  values={point.sparkline}
                  label={metric.label + ' trend'}
                />
              </>
            ) : state.loading ? (
              <div className="lv-admin-kpi-skeleton" role="status">
                Loading…
              </div>
            ) : (
              <div className="lv-admin-kpi-missing">
                —
                <small>
                  {state.error ? 'Couldn’t load' : 'Source unavailable'}
                </small>
                <button type="button" onClick={state.retry}>
                  Retry
                </button>
              </div>
            )}
            {state.value?.mode === 'demo' && (
              <span className="lv-admin-kpi-demo">Demo</span>
            )}
            {point && state.error && (
              <button
                type="button"
                className="lv-admin-mini-retry"
                onClick={state.retry}
              >
                Snapshot · Retry
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
export function ChartPanel({
  data,
  monthly = false,
  label,
  demo = false,
}: {
  data: OverviewData;
  monthly?: boolean;
  label: string;
  demo?: boolean;
}) {
  const [table, setTable] = useState(false);
  const rows = data.series;
  const comparison = rows.some((row) => row.previous !== null);
  const money = (v: unknown) => (typeof v === 'number' ? formatNaira(v) : '—');
  return (
    <>
      <div className="lv-admin-chart-toolbar">
        <div className="lv-admin-chart-legend">
          <span>
            <i />
            {monthly ? 'Net revenue' : 'Current period'}
          </span>
          {(monthly || comparison) && (
            <span>
              <i className={monthly ? 'is-teal' : 'is-previous'} />
              {monthly ? 'Expenses' : 'Previous period'}
            </span>
          )}
        </div>
        <details className="lv-admin-chart-menu">
          <summary aria-label={label + ' options'}>
            <MoreHorizontal size={20} />
          </summary>
          <div>
            <button
              type="button"
              onClick={(event) => {
                setTable((v) => !v);
                event.currentTarget.closest('details')?.removeAttribute('open');
              }}
            >
              {table ? 'View chart' : 'View as table'}
            </button>
            <button
              type="button"
              onClick={() =>
                exportRows(
                  (demo ? 'demo-' : '') +
                    (monthly ? 'monthly-finance' : 'net-revenue'),
                  [
                    'Date (WAT)',
                    'Net revenue (kobo)',
                    monthly ? 'Expenses (kobo)' : 'Previous revenue (kobo)',
                  ],
                  rows.map((row) => [
                    row.day,
                    row.value,
                    monthly ? (row.extra ?? 0) : row.previous,
                  ]),
                )
              }
            >
              Export CSV
            </button>
          </div>
        </details>
      </div>
      {!rows.length ? (
        <div className="lv-admin-widget-empty">No sales in this range</div>
      ) : table ? (
        <div className="lv-admin-table-wrap">
          <table>
            <caption>
              {label}
              {demo ? ' · Demo' : ''}
            </caption>
            <thead>
              <tr>
                <th>Date (WAT)</th>
                <th>Net revenue</th>
                {(monthly || comparison) && (
                  <th>{monthly ? 'Expenses' : 'Previous'}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.day}>
                  <td>{row.day}</td>
                  <td>{money(row.value)}</td>
                  {(monthly || comparison) && (
                    <td>{money(monthly ? row.extra : row.previous)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className={'lv-admin-chart ' + (monthly ? 'is-monthly' : '')}
          role="img"
          aria-label={label + '. Table available in chart options.'}
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            {monthly ? (
              <BarChart
                data={rows}
                margin={{ top: 16, right: 8, left: -12, bottom: 0 }}
                accessibilityLayer
              >
                <CartesianGrid vertical={false} stroke="var(--color-line)" />
                <XAxis
                  dataKey="day"
                  tickFormatter={(v: string) => v.slice(5)}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={compactMoney}
                  width={74}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip formatter={money} />
                <Bar
                  dataKey="value"
                  name="Net revenue"
                  fill="var(--color-chart-indigo)"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey="value"
                    position="top"
                    formatter={(value: unknown) =>
                      typeof value === 'number' && value === rows.at(-1)?.value
                        ? compactMoney(value)
                        : ''
                    }
                  />
                </Bar>
                <Bar
                  dataKey="extra"
                  name="Expenses"
                  fill="var(--color-chart-teal)"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            ) : (
              <LineChart
                data={rows}
                margin={{ top: 16, right: 12, left: -8, bottom: 0 }}
                accessibilityLayer
              >
                <CartesianGrid vertical={false} stroke="var(--color-line)" />
                <XAxis
                  dataKey="day"
                  tickFormatter={(v: string) => v.slice(5)}
                  minTickGap={40}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={compactMoney}
                  width={74}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  content={({
                    active,
                    payload,
                    label: date,
                  }: TooltipContentProps<number, string>) => {
                    if (!active || !payload?.length) return null;
                    const current = payload.find(
                      (p) => p.dataKey === 'value',
                    )?.value;
                    const previous = payload.find(
                      (p) => p.dataKey === 'previous',
                    )?.value;
                    const delta =
                      typeof current === 'number' &&
                      typeof previous === 'number'
                        ? metricChange(current, previous)
                        : null;
                    return (
                      <div className="lv-admin-chart-tooltip">
                        <strong>
                          {String(date)} · WAT{demo ? ' · Demo' : ''}
                        </strong>
                        <span>Net revenue {money(current)}</span>
                        {comparison && <span>Previous {money(previous)}</span>}
                        {delta !== null && (
                          <span>
                            {delta >= 0 ? '↑' : '↓'}{' '}
                            {Math.abs(delta).toFixed(1)}% change
                          </span>
                        )}
                      </div>
                    );
                  }}
                />
                <Line
                  type="linear"
                  dataKey="value"
                  name="Net revenue"
                  stroke="var(--color-chart-indigo)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                {comparison && (
                  <Line
                    type="linear"
                    dataKey="previous"
                    name="Previous period"
                    stroke="var(--color-chart-previous)"
                    strokeDasharray="5 4"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                )}
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}
export function LiveSummary({
  data,
  onOpen,
}: {
  data: OverviewData;
  onOpen: () => void;
}) {
  if (!data.rows.length)
    return (
      <div className="lv-admin-widget-empty">
        No live activity in this snapshot.
      </div>
    );
  const peak = Math.max(0, ...data.series.map((row) => row.value));
  return (
    <>
      <div className="lv-admin-live-stats">
        {data.rows.slice(0, 4).map((row) => (
          <div key={row.label}>
            <span>{row.label}</span>
            <strong>{number(row.value)}</strong>
          </div>
        ))}
      </div>
      <div className="lv-admin-live-caption">
        <span>Bids per hour, last 24 hours</span>
        <span>Peak {number(peak)}</span>
      </div>
      <Sparkline
        values={data.series.map((row) => row.value)}
        label="Bids per hour, last 24 hours"
      />
      <div className="lv-admin-live-axis">
        <span>24h ago</span>
        <span>12h ago</span>
        <span>Now</span>
      </div>
      <details className="lv-admin-live-table">
        <summary>View hourly bids as table</summary>
        <div className="lv-admin-table-wrap">
          <table>
            <caption>Hourly bids, last 24 hours</caption>
            <thead>
              <tr>
                <th>Hour</th>
                <th>Bids</th>
              </tr>
            </thead>
            <tbody>
              {data.series.map((row) => (
                <tr key={row.day}>
                  <td>{row.day}</td>
                  <td>{number(row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <footer>
        <span>
          Last 24 hours: <b>{compactMoney(data.rows[4]?.value ?? 0)}</b> GMV ·{' '}
          <b>{((data.rows[5]?.value ?? 0) / 100).toFixed(1)}%</b> sold
        </span>
        <button
          type="button"
          onClick={onOpen}
          disabled
          title="Dedicated live monitor is not available yet"
        >
          Open live monitor <ArrowUpRight size={14} />
        </button>
      </footer>
    </>
  );
}
function RowAlternative({
  data,
  label,
  money = false,
  children,
}: {
  data: OverviewData;
  label: string;
  money?: boolean;
  children: ReactNode;
}) {
  const [table, setTable] = useState(false);
  const demo = useContext(DemoSource);
  return (
    <>
      <div className="lv-admin-row-tools">
        <button
          type="button"
          className="lv-admin-text-link"
          onClick={() => setTable((v) => !v)}
        >
          {table ? 'View chart' : 'View as table'}
        </button>
        <button
          type="button"
          className="lv-admin-text-link"
          onClick={() =>
            exportRows(
              (demo ? 'demo-' : '') + label.toLowerCase().replaceAll(' ', '-'),
              [
                'Category or stage',
                money ? 'Amount (kobo)' : 'Count',
                'Cost (kobo), where available',
              ],
              data.rows.map((row) => [
                row.label,
                row.value,
                row.secondary ?? null,
              ]),
            )
          }
        >
          Export CSV
        </button>
      </div>
      {table ? (
        <div className="lv-admin-table-wrap">
          <table>
            <caption>
              {label}
              {demo ? ' - Demo' : ''}
            </caption>
            <thead>
              <tr>
                <th>Category or stage</th>
                <th>{money ? 'Amount' : 'Count'}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{money ? formatNaira(row.value) : number(row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </>
  );
}
export function CategoryBars({ data }: { data: OverviewData }) {
  const rows = [...data.rows].sort((a, b) => b.value - a.value),
    max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <RowAlternative data={data} label="GMV by category" money>
      {rows.length ? (
        <div className="lv-admin-categories">
          {rows.map((row) => (
            <div key={row.label}>
              <span>{row.label}</span>
              <meter
                min={0}
                max={max}
                value={row.value}
                aria-label={row.label + ' GMV'}
              />
              <strong>{compactMoney(row.value)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p>No sold lots in this range.</p>
      )}
    </RowAlternative>
  );
}
export function Funnel({ data }: { data: OverviewData }) {
  if (!data.rows.length)
    return (
      <div className="lv-admin-widget-empty">
        No listing cohort in this range.
      </div>
    );
  const max = Math.max(1, data.rows[0]?.value ?? 0);
  return (
    <RowAlternative data={data} label="Listing to collection">
      <div className="lv-admin-funnel">
        {data.rows.map((row, i) => (
          <div key={row.label}>
            <div>
              <strong>{row.label}</strong>
              <span>{number(row.value)} lots</span>
            </div>
            <div>
              <meter
                min={0}
                max={max}
                value={row.value}
                className={i === 4 ? 'is-teal' : ''}
                aria-label={row.label}
              />
              {i > 0 && (
                <small>
                  ↓{' '}
                  {(
                    (row.value / Math.max(1, data.rows[i - 1]?.value ?? 1)) *
                    100
                  ).toFixed(1)}
                  % progressed from {data.rows[i - 1]?.label.toLowerCase()}
                </small>
              )}
            </div>
          </div>
        ))}
      </div>
    </RowAlternative>
  );
}
export function AttentionQueue({
  data,
  onOpen,
}: {
  data: OverviewData;
  onOpen: (destination: string) => void;
}) {
  return (
    <div className="lv-admin-attention">
      {data.rows.length ? (
        data.rows.map((row) => (
          <button
            type="button"
            key={row.label}
            onClick={() => row.destination && onOpen(row.destination)}
          >
            <i className={'is-' + row.tone} />
            <span>
              <strong>{row.label}</strong>
              <small>{row.detail}</small>
            </span>
            <b>{number(row.value)}</b>
          </button>
        ))
      ) : (
        <p>All clear. No requests need attention.</p>
      )}
    </div>
  );
}
export function TopLots({ data }: { data: OverviewData }) {
  return (
    <div className="lv-admin-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Lot</th>
            <th>Hammer</th>
            <th>% of retail</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.reference}>
              <td>
                {row.label}
                <small>
                  {row.reference} · {row.detail}
                </small>
              </td>
              <td>{formatNaira(row.value)}</td>
              <td>{((row.secondary ?? 0) / 100).toFixed(0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data.rows.length && <p>No auction sales in this range.</p>}
    </div>
  );
}
export function ActivityFeed({ data }: { data: OverviewData }) {
  return (
    <div className="lv-admin-activity">
      {data.rows.map((row) => (
        <div key={row.label}>
          <span className="lv-admin-initials">{row.reference}</span>
          <div>
            <p>{row.label}</p>
            <small>{row.detail}</small>
            <time>
              {row.value < 60
                ? `${row.value} min ago`
                : `${Math.floor(row.value / 60)}h ago`}
            </time>
          </div>
        </div>
      ))}
      {!data.rows.length && <p>No recorded activity.</p>}
    </div>
  );
}
export function StockAge({ data }: { data: OverviewData }) {
  return (
    <RowAlternative data={data} label="Unsold stock by age">
      <div className="lv-admin-stock">
        {data.rows.map((row) => (
          <div key={row.label}>
            <div>
              <span>{row.label}</span>
              <span>
                <b>{number(row.value)} lots</b> ·{' '}
                {compactMoney(row.secondary ?? 0)}
              </span>
            </div>
            <meter
              min={0}
              max={Math.max(1, ...data.rows.map((r) => r.value))}
              value={row.value}
              className={'is-' + row.tone}
              aria-label={row.label}
            />
          </div>
        ))}
        {!data.rows.length && <p>No unsold stock.</p>}
      </div>
    </RowAlternative>
  );
}
export function AlertStrip({
  state,
  onOpen,
}: {
  state: WidgetState;
  onOpen: (destination: string) => void;
}) {
  return (
    <div className="lv-admin-alerts">
      {state.value?.data?.rows
        .filter(
          (row) =>
            row.value > 0 &&
            ['Overdue pickups', 'Unmatched top-ups'].includes(row.label),
        )
        .map((row) => (
          <div className={'lv-admin-alert is-' + row.tone} key={row.label}>
            <TriangleAlert size={18} />
            <span>
              <strong>
                {row.label}: {number(row.value)}
              </strong>{' '}
              · {row.detail}
              {state.value?.mode === 'demo' ? ' · Demo' : ''}
            </span>
            <button
              type="button"
              onClick={() => row.destination && onOpen(row.destination)}
            >
              {row.label === 'Overdue pickups'
                ? 'Open overdue list'
                : 'Review exceptions'}
            </button>
          </div>
        ))}
    </div>
  );
}
