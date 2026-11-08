'use client';
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Activity,
  CircleHelp,
  Download,
  MoreHorizontal,
  Pause,
  MessageSquare,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  formatNaira,
  monitorSecondsLeft,
  monitorTimerText,
  type MonitorLot,
  type MonitorSummary,
  type MonitorSeries,
  type MonitorIssues,
  type MonitorClosed,
} from '@auction-ng/shared';
import { Button } from '../web/button';
import { productImageSource } from '../web/demo-image';
import { exportRows, compactMoney } from './overview-widgets';

export type LivePanel<T> = {
  value: T | null;
  error: string;
  loading: boolean;
  retry: () => void;
};
const number = (n: number | null) =>
  n === null ? '—' : new Intl.NumberFormat('en-NG').format(n);
const time = (at: string) =>
  new Date(at).toLocaleTimeString('en-NG', {
    timeZone: 'Africa/Lagos',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
export function MonitorFrame<T>({
  title,
  subtitle,
  state,
  children,
  actions,
  className = '',
}: {
  title: string;
  subtitle?: string;
  state: LivePanel<T>;
  children: (value: T) => ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={'lv-admin-widget lv-monitor-card ' + className}
      aria-label={title}
    >
      <header>
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions}
      </header>
      {state.error && (
        <div className="lv-admin-widget-error" role="alert">
          {state.error}{' '}
          <button type="button" onClick={state.retry}>
            Retry
          </button>
        </div>
      )}
      {state.value ? (
        children(state.value)
      ) : state.loading ? (
        <div
          className="lv-admin-widget-skeleton"
          aria-label={'Loading ' + title}
          role="status"
        >
          <span />
          <span />
          <span />
        </div>
      ) : !state.error ? (
        <p className="lv-monitor-empty">No data is available yet.</p>
      ) : null}
    </section>
  );
}
export function LiveMonitorHeader({
  summary,
  live,
  now,
  onMessage,
  onEmergency,
  canPause,
  controlsReady,
  messagingReady = false,
}: {
  summary: MonitorSummary | null;
  live: boolean;
  now: number | null;
  onMessage: () => void;
  onEmergency: () => void;
  canPause: boolean;
  controlsReady: boolean;
  messagingReady?: boolean;
}) {
  return (
    <header className="lv-monitor-heading">
      <div>
        <p className="lv-monitor-eyebrow">Auctions</p>
        <div className="lv-monitor-title">
          <h1>Live monitor</h1>
          <span className="lv-monitor-running">
            <i />
            {live
              ? summary?.phase === 'resuming'
                ? 'Restoring countdowns'
                : summary?.paused
                  ? 'Bidding paused'
                  : 'Running 24/7'
              : 'Reconnecting…'}
          </span>
        </div>
        <p className="lv-monitor-subline">
          {live ? 'Updates in real time' : 'Waiting for confirmed live data'}
          {now !== null && (
            <>
              {' '}
              ·{' '}
              {new Date(now).toLocaleString('en-NG', {
                timeZone: 'Africa/Lagos',
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              WAT
            </>
          )}
          {summary && (
            <>
              {' '}
              · {number(summary.liveCount)} lots live, each on its own countdown
            </>
          )}
        </p>
      </div>
      <div className="lv-monitor-header-actions">
        <Button
          variant="secondary"
          onClick={onMessage}
          disabled={!live || !messagingReady}
        >
          <MessageSquare size={16} />
          Message bidders on a lot
        </Button>
        {canPause && (
          <Button
            variant="secondary"
            className="lv-monitor-emergency"
            disabled={!live || !controlsReady}
            onClick={onEmergency}
          >
            <Pause size={16} />
            {summary?.paused
              ? 'Resume all bidding'
              : 'Pause all bidding (emergency)'}
          </Button>
        )}
      </div>
    </header>
  );
}
export function MonitorKpis({
  state,
  stale,
}: {
  state: LivePanel<MonitorSummary>;
  stale: boolean;
}) {
  const v = state.value;
  const rows = v
    ? [
        [
          'Lots live',
          number(v.liveCount),
          number(v.endingHourCount) + ' end in the next hour',
        ],
        [
          'Ended today',
          number(v.endedTodayCount),
          (v.endedTodayCount
            ? ((v.soldTodayCount / v.endedTodayCount) * 100).toFixed(1)
            : '0') +
            '% sold (' +
            number(v.soldTodayCount) +
            ')',
        ],
        [
          'GMV today',
          compactMoney(v.gmvTodayKobo, 2),
          'Hammer total since midnight WAT',
        ],
        [
          'Bids per minute',
          number(v.bidsPerMinute),
          'Peak ' +
            number(v.bidsPeak) +
            (v.bidsPeakAt ? ' at ' + time(v.bidsPeakAt) : ''),
        ],
        [
          'Buyers online',
          number(v.onlineBuyers),
          v.onlineBidBuyers === null
            ? 'Presence tracking unavailable'
            : number(v.onlineBidBuyers) + ' have bid',
        ],
        [
          'Soft-close extensions',
          number(v.extensionCount),
          'Avg ' +
            (v.extendedLotCount
              ? (v.extensionCount / v.extendedLotCount).toFixed(1)
              : '0') +
            ' per extended lot',
        ],
      ]
    : Array.from({ length: 6 }, () => ['Loading', '—', '']);
  return (
    <div>
      <div
        className={'lv-admin-kpis lv-monitor-kpis' + (stale ? ' is-stale' : '')}
        aria-label="Live auction statistics"
      >
        {rows.map((row, i) => (
          <article className="lv-admin-kpi" key={i}>
            <p>{row[0]}</p>
            <strong
              title={i === 2 && v ? formatNaira(v.gmvTodayKobo) : undefined}
            >
              {row[1]}
            </strong>
            <small>{row[2]}</small>
          </article>
        ))}
      </div>
      {state.error && (
        <p className="lv-admin-widget-error" role="alert">
          {state.error}{' '}
          <button onClick={state.retry} type="button">
            Retry statistics
          </button>
        </p>
      )}
    </div>
  );
}
const MonitorRow = memo(function MonitorRow({
  row,
  now,
  stale,
  onActions,
  buyerUrl,
}: {
  row: MonitorLot;
  now: number | null;
  stale: boolean;
  onActions: (row: MonitorLot) => void;
  buyerUrl: string;
}) {
  const seconds = monitorSecondsLeft(
    row.endsAt,
    stale ? null : now,
    row.paused ? row.remainingMs : null,
  );
  const previous = useRef(row.currentPriceKobo),
    [flash, setFlash] = useState(false);
  useEffect(() => {
    if (previous.current === row.currentPriceKobo) return;
    previous.current = row.currentPriceKobo;
    setFlash(true);
    const timeout = setTimeout(() => setFlash(false), 300);
    return () => clearTimeout(timeout);
  }, [row.currentPriceKobo]);
  const hours = seconds === null ? 0 : Math.floor(seconds / 3600),
    minutes = seconds === null ? 0 : Math.floor((seconds % 3600) / 60),
    rest = seconds === null ? 0 : seconds % 60;
  const text =
    seconds === null
      ? '—'
      : seconds === 0
        ? 'Closing'
        : (hours ? hours.toString().padStart(2, '0') + ':' : '') +
          minutes.toString().padStart(2, '0') +
          ':' +
          rest.toString().padStart(2, '0');
  return (
    <tr className={flash ? 'lv-monitor-price-flash' : ''}>
      <td>
        <span
          className={
            'lv-monitor-timer' +
            (seconds !== null && seconds > 0 && seconds <= 120
              ? ' is-urgent'
              : '')
          }
          aria-label={
            row.paused
              ? 'Paused · ' + monitorTimerText(seconds)
              : monitorTimerText(seconds)
          }
        >
          <span aria-hidden="true">{row.paused ? 'Paused' : text}</span>
        </span>
      </td>
      <td>
        <div className="lv-monitor-item">
          {row.thumbnail ? (
            <img
              src={new URL(productImageSource(row.thumbnail), buyerUrl).href}
              width={36}
              height={36}
              alt=""
              loading="lazy"
            />
          ) : (
            <span className="lv-monitor-photo-empty" />
          )}
          <div>
            <strong>{row.title}</strong>
            <small>{row.reference}</small>
          </div>
        </div>
      </td>
      <td
        className="lv-monitor-runtime"
        title={
          row.runTimeMs === null
            ? 'Original run time was not recorded for this older listing. Current deadlines may include extensions.'
            : undefined
        }
      >
        {row.runTimeMs === null ? (
          <span className="lv-monitor-muted">Not recorded</span>
        ) : (
          number(row.runTimeMs / 3600000) + ' h'
        )}
      </td>
      <td
        className="lv-monitor-price"
        title={
          row.currentPriceKobo === null
            ? undefined
            : formatNaira(row.currentPriceKobo)
        }
      >
        {stale || row.currentPriceKobo === null
          ? '—'
          : formatNaira(row.currentPriceKobo)}
      </td>
      <td>{number(row.bidCount)}</td>
      <td>
        {row.leading ?? '—'}
        {row.area && ' · ' + row.area}
      </td>
      <td>{number(row.watchers)}</td>
      <td>{row.extensions ? number(row.extensions) + '×' : '—'}</td>
      <td>
        <button
          className="lv-monitor-row-action"
          type="button"
          disabled={stale}
          onClick={() => onActions(row)}
          aria-label={'Actions for ' + row.reference}
        >
          <MoreHorizontal size={18} />
        </button>
      </td>
    </tr>
  );
});
export function MonitorTable({
  rows,
  now,
  stale,
  onActions,
  buyerUrl,
}: {
  rows: MonitorLot[];
  now: number | null;
  stale: boolean;
  onActions: (row: MonitorLot) => void;
  buyerUrl: string;
}) {
  const [top, setTop] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState(650);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setViewportHeight(node.clientHeight),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const height = 64,
    visible = Math.ceil(viewportHeight / height) + 4,
    first = Math.max(0, Math.floor(top / height) - 2),
    last = Math.min(rows.length, first + visible);
  return (
    <div
      ref={viewport}
      className={'lv-monitor-table-scroll' + (stale ? ' is-stale' : '')}
      onScroll={(event) => setTop(event.currentTarget.scrollTop)}
      tabIndex={0}
      role="region"
      aria-label="Closing next auctions"
    >
      <table className="lv-monitor-table">
        <thead>
          <tr>
            {[
              'Time left',
              'Lot',
              'Run time',
              'Current bid',
              'Bids',
              'Leading',
              'Watchers',
              'Extended',
              'Actions',
            ].map((label) => (
              <th scope="col" key={label}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {first > 0 && (
            <tr aria-hidden="true">
              <td colSpan={9} style={{ height: first * height, padding: 0 }} />
            </tr>
          )}
          {rows.slice(first, last).map((row) => (
            <MonitorRow
              key={row.id}
              row={row}
              now={now}
              stale={stale}
              onActions={onActions}
              buyerUrl={buyerUrl}
            />
          ))}
          {last < rows.length && (
            <tr aria-hidden="true">
              <td
                colSpan={9}
                style={{ height: (rows.length - last) * height, padding: 0 }}
              />
            </tr>
          )}
        </tbody>
      </table>
      {!rows.length && (
        <p className="lv-monitor-empty">
          <Activity size={20} />
          No lots are live right now.
        </p>
      )}
    </div>
  );
}
export function MonitorBidChart({
  state,
  stale,
}: {
  state: LivePanel<MonitorSeries>;
  stale: boolean;
}) {
  const [table, setTable] = useState(false),
    points = state.value?.points ?? [];
  const peak = Math.max(400, ...points.map((p) => p.value)),
    top = Math.ceil(peak / 200) * 200;
  return (
    <MonitorFrame
      title="Bids per minute"
      subtitle={
        'Last 60 minutes · now ' +
        (stale ? '—' : number(points.at(-1)?.value ?? 0))
      }
      state={state}
      actions={
        <div className="lv-monitor-chart-actions">
          <button type="button" onClick={() => setTable((v) => !v)}>
            {table ? 'View chart' : 'View as table'}
          </button>
          <button
            type="button"
            aria-label="Export bid activity CSV"
            disabled={!points.length}
            onClick={() =>
              exportRows(
                'bid-activity',
                ['Minute (WAT)', 'Bids'],
                points.map((p) => [time(p.at), p.value]),
              )
            }
          >
            <Download size={16} />
          </button>
        </div>
      }
    >
      {(value) =>
        table ? (
          <div className="lv-monitor-chart-table">
            <table>
              <thead>
                <tr>
                  <th>Minute (WAT)</th>
                  <th>Bids</th>
                </tr>
              </thead>
              <tbody>
                {value.points.map((point) => (
                  <tr key={point.at}>
                    <td>{time(point.at)}</td>
                    <td>{number(point.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={'lv-monitor-chart' + (stale ? ' is-stale' : '')}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={value.points}
                margin={{ top: 12, left: 0, right: 8, bottom: 4 }}
              >
                <CartesianGrid vertical={false} stroke="var(--color-line)" />
                <XAxis
                  dataKey="at"
                  tickFormatter={time}
                  ticks={[
                    value.points[0]?.at,
                    value.points[29]?.at,
                    value.points.at(-1)?.at,
                  ].filter((v): v is string => !!v)}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis
                  domain={[0, top]}
                  ticks={[0, top / 2, top]}
                  width={38}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  labelFormatter={(value) => time(String(value)) + ' WAT'}
                />
                <Line
                  dataKey="value"
                  name="Accepted bids"
                  stroke="var(--color-chart-indigo)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )
      }
    </MonitorFrame>
  );
}
export function MonitorIssuesCard({
  state,
  onDetails,
  stale = false,
}: {
  state: LivePanel<MonitorIssues>;
  onDetails: (kind: string) => void;
  stale?: boolean;
}) {
  return (
    <MonitorFrame
      title="Issues today"
      subtitle="Since midnight Nigerian time (WAT)"
      state={state}
      actions={
        <span
          className={
            stale || state.error ? 'lv-monitor-muted' : 'lv-monitor-live-status'
          }
        >
          {!stale && !state.error && <i aria-hidden="true" />}
          {stale || state.error ? 'Updates delayed' : 'Live'}
        </span>
      }
    >
      {(value) => (
        <div className="lv-monitor-issues">
          {value.items.map((row) => (
            <button
              type="button"
              key={row.kind}
              onClick={() => onDetails(row.kind)}
            >
              <i className={'lv-monitor-dot is-' + row.tone} />
              <span>
                {row.label}
                <small>{row.context}</small>
              </span>
              <strong>{number(row.count)}</strong>
              <CircleHelp size={14} />
            </button>
          ))}
        </div>
      )}
    </MonitorFrame>
  );
}
export function MonitorClosedCard({
  state,
  onAll,
}: {
  state: LivePanel<MonitorClosed>;
  onAll: () => void;
}) {
  return (
    <MonitorFrame
      title="Just closed"
      className="lv-monitor-closed-card"
      state={state}
      actions={
        <button
          type="button"
          className="lv-monitor-text-action"
          onClick={onAll}
        >
          All {number(state.value?.totalToday ?? 0)}
        </button>
      }
    >
      {(value) => (
        <div
          className="lv-monitor-closed"
          role="region"
          aria-label="Recently closed items"
          tabIndex={0}
        >
          {value.items.length ? (
            value.items.map((row) => (
              <article key={row.id}>
                <div>
                  <strong>{row.title}</strong>
                  <small>
                    {row.winner
                      ? 'Won by ' +
                        row.winner +
                        ' · ' +
                        number(row.bidCount) +
                        ' bids'
                      : row.bidCount
                        ? number(row.bidCount) + ' bids · no sale'
                        : 'No bids'}
                  </small>
                </div>
                <span className={'lv-monitor-badge is-' + row.status}>
                  {row.status === 'sold'
                    ? 'Sold'
                    : row.status === 'unsold'
                      ? 'Unsold'
                      : 'Payment pending'}
                </span>
                <b>
                  {row.hammerKobo === null ? '—' : formatNaira(row.hammerKobo)}
                </b>
              </article>
            ))
          ) : (
            <p className="lv-monitor-empty">No lots have closed today.</p>
          )}
        </div>
      )}
    </MonitorFrame>
  );
}
