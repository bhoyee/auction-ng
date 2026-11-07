'use client';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Download, ScanLine } from '@auction-ng/ui/admin/overview-widgets';
import { ApiError } from '@auction-ng/api-client/auth';
import { createStaffAdminClient } from '@auction-ng/api-client/staff-admin';
import {
  comparisonRange,
  overviewQuerySchema,
  overviewPointCount,
  overviewRange,
  overviewWidgets,
  overviewMetrics,
  formatNaira,
  type OverviewMetric,
  overviewWidgetPermissions,
  watDay,
  type OverviewQuery,
  type OverviewResponse,
  type OverviewWidget,
} from '@auction-ng/shared';
import {
  ActivityFeed,
  AlertStrip,
  AttentionQueue,
  CategoryBars,
  ChartPanel,
  Funnel,
  KpiGrid,
  LiveSummary,
  StockAge,
  TopLots,
  WidgetFrame,
  exportRows,
  type WidgetState,
} from '@auction-ng/ui/admin/overview-widgets';
import { DateRangeControl } from '@auction-ng/ui/admin/date-range-control';
import type { StaffSection } from '@auction-ng/ui/web/staff-dashboard-view';

type Snapshot = {
  key: string;
  value?: OverviewResponse;
  error: string;
  loading: boolean;
};
const required = (widget: OverviewWidget) => overviewWidgetPermissions[widget];
export function OverviewDashboard({
  apiUrl,
  accessToken,
  deviceId,
  name,
  role,
  permissions,
  onNavigate,
  onCheckIn,
  onUnauthorized,
}: {
  apiUrl: string;
  accessToken: string;
  deviceId: string;
  name: string;
  role: string;
  permissions: readonly string[];
  onNavigate: (section: StaffSection) => void;
  onCheckIn: () => void;
  onUnauthorized: (token: string) => void;
}) {
  const [query, setQuery] = useState<OverviewQuery>(() => ({
    ...overviewRange('30'),
    compare: 'prev',
    grain: 'day',
  }));
  const [preset, setPreset] = useState('30');
  const [rangeError, setRangeError] = useState('');
  const [report, setReport] = useState<OverviewMetric>();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const [ready, setReady] = useState(false);
  const [snapshots, setSnapshots] = useState<
    Partial<Record<OverviewWidget, Snapshot>>
  >({});
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  const client = useMemo(
    () => createStaffAdminClient(apiUrl, { accessToken, deviceId }),
    [apiUrl, accessToken, deviceId],
  );
  const scope = JSON.stringify([accessToken, deviceId, query, permissions]);
  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(window.location.search);
      const parsed = overviewQuerySchema.safeParse({
        from: params.get('from') ?? overviewRange('30').from,
        to: params.get('to') ?? watDay(),
        compare: params.get('compare') ?? 'prev',
        grain: params.get('grain') ?? 'day',
      });
      if (parsed.success) {
        setQuery(parsed.data);
        setRangeError('');
      } else
        setRangeError(
          'Invalid analytics range. Showing the last 30 days; choose a valid range or a coarser grain.',
        );
      const selected = params.get('range');
      setPreset(
        selected &&
          ['today', '7', '30', 'month', 'year', 'all', 'custom'].includes(
            selected,
          )
          ? selected
          : params.has('from')
            ? 'custom'
            : '30',
      );
      setReady(true);
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  function change(next: OverviewQuery, selection = preset) {
    if (overviewPointCount(next) > 400) next = { ...next, grain: 'week' };
    if (overviewPointCount(next) > 400) next = { ...next, grain: 'month' };
    if (!overviewQuerySchema.safeParse(next).success) {
      setRangeError(
        'Choose a shorter valid range. Charts show at most 400 points.',
      );
      return;
    }
    setRangeError('');
    setReady(true);
    setQuery(next);
    setPreset(selection);
    const params = new URLSearchParams(window.location.search);
    Object.entries({ ...next, range: selection }).forEach(([key, value]) =>
      params.set(key, value),
    );
    window.history.replaceState(null, '', '?' + params);
  }
  useEffect(() => {
    if (!ready) return;
    let active = true;
    const pending = new Set<OverviewWidget>();
    async function read(widget: OverviewWidget) {
      if (
        !active ||
        document.hidden ||
        !navigator.onLine ||
        pending.has(widget) ||
        !permissions.includes(required(widget))
      )
        return;
      pending.add(widget);
      setSnapshots((old) => ({
        ...old,
        [widget]: {
          key: scope,
          value: old[widget]?.key === scope ? old[widget]?.value : undefined,
          error: '',
          loading: true,
        },
      }));
      try {
        const value = await client.overviewWidget(widget, query);
        if (active)
          setSnapshots((old) => ({
            ...old,
            [widget]: { key: scope, value, error: '', loading: false },
          }));
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401)
          onUnauthorized(accessToken);
        setSnapshots((old) => ({
          ...old,
          [widget]: {
            key: scope,
            value: old[widget]?.key === scope ? old[widget]?.value : undefined,
            error:
              error instanceof ApiError && error.status === 403
                ? 'Your role cannot access this widget.'
                : 'Couldn’t load. Check your connection and retry.',
            loading: false,
          },
        }));
      } finally {
        pending.delete(widget);
      }
    }
    const refresh = () => {
      for (const widget of overviewWidgets) void read(widget);
    };
    const retry = (event: Event) => {
      const widget = (event as CustomEvent<OverviewWidget>).detail;
      if (overviewWidgets.includes(widget)) void read(widget);
    };
    window.addEventListener('lotvanta:overview-retry', retry);
    refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      window.removeEventListener('lotvanta:overview-retry', retry);
      clearInterval(timer);
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [client, scope, ready]);
  function state(widget: OverviewWidget): WidgetState {
    const found =
      snapshots[widget]?.key === scope ? snapshots[widget] : undefined;
    const allowed = permissions.includes(required(widget));
    return {
      value: found?.value,
      error: allowed
        ? (found?.error ?? '')
        : 'Your role cannot access this widget.',
      loading: allowed && (!found || found.loading),
      retry: () =>
        window.dispatchEvent(
          new CustomEvent('lotvanta:overview-retry', { detail: widget }),
        ),
    };
  }
  const states = Object.fromEntries(
    overviewWidgets.map((widget) => [widget, state(widget)]),
  ) as Record<OverviewWidget, WidgetState>;
  const demo = Object.values(states).some((s) => s.value?.mode === 'demo');
  const previous = comparisonRange(query);
  const period = `${query.from} – ${query.to}`;
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Lagos',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(new Date()),
  );
  const updated =
    states.kpis.value?.updatedAt ?? states.attention.value?.updatedAt;
  const minutes = updated
    ? Math.max(0, Math.floor((now - Date.parse(updated)) / 60000))
    : null;
  const open = (destination: string) => {
    const permitted: Record<string, string> = {
      inventory: 'inventory.read',
      auctions: 'auctions.manage',
      pickup: 'pickup.manage',
      finance: 'finance.read',
      support: 'support.manage',
      buyers: 'buyers.read',
      audit: 'audit.read',
    };
    if (permissions.includes(permitted[destination] ?? 'unavailable')) {
      const retained = { ...query, range: preset };
      onNavigate(destination as StaffSection);
      const params = new URLSearchParams(window.location.search);
      Object.entries(retained).forEach(([key, value]) =>
        params.set(key, value),
      );
      window.history.replaceState(null, '', '?' + params);
    }
  };
  const action = (label: string, destination: string) => (
    <button
      type="button"
      className="lv-admin-text-link"
      onClick={() => open(destination)}
    >
      {label}
    </button>
  );
  const full = permissions.includes('finance.read');
  const liveTarget = ready
    ? document.getElementById('staff-overview-live-status')
    : null;
  const live = states.live.value?.data;
  const badgeSlots = ready
    ? [
        ['overview-count-lots', 'Draft lots to publish'],
        ['overview-count-pickup-desk', 'Overdue pickups'],
        ['overview-count-refunds-and-payouts', 'Refunds awaiting approval'],
      ].map(([id, label]) => ({
        target: document.getElementById(id ?? ''),
        row: states.attention.value?.data?.rows.find(
          (row) => row.label === label,
        ),
      }))
    : [];
  const dates = new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
  return (
    <div className="lv-admin-overview">
      <Dialog
        open={!!report}
        title={
          report ? overviewMetrics[report].label + ' report' : 'Metric report'
        }
        onClose={() => setReport(undefined)}
      >
        {report && (
          <>
            <p>
              {period} · WAT{demo ? ' · Demo analytics' : ''}
            </p>
            <p>{overviewMetrics[report].definition}</p>
            <div className="lv-admin-table-wrap">
              <table>
                <caption>
                  {overviewMetrics[report].label} · same selected range
                </caption>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {['current', 'previous'].map((side) => {
                    const point = states.kpis.value?.data?.kpis.find(
                      (point) => point.id === report,
                    );
                    const value =
                      side === 'current' ? point?.value : point?.previous;
                    return (
                      <tr key={side}>
                        <td>
                          {side === 'current'
                            ? period
                            : previous
                              ? previous.from + ' – ' + previous.to
                              : 'No comparison'}
                        </td>
                        <td>
                          {value === null || value === undefined
                            ? '—'
                            : overviewMetrics[report].format === 'money'
                              ? formatNaira(value)
                              : overviewMetrics[report].format === 'percent'
                                ? (value / 100).toFixed(1) + '%'
                                : value.toLocaleString('en-NG')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {report === 'netRevenue' && states.revenue.value?.data && (
              <ChartPanel
                data={states.revenue.value.data}
                label="Net revenue report"
                demo={demo}
              />
            )}
            {report === 'gmv' && (
              <WidgetFrame title="GMV by category" state={states.categories}>
                {(data) => <CategoryBars data={data} />}
              </WidgetFrame>
            )}
          </>
        )}
      </Dialog>
      {badgeSlots.map(({ target, row }) =>
        target && row && row.value > 0
          ? createPortal(
              <b
                title={
                  (states.attention.value?.mode === 'demo' ? 'Demo · ' : '') +
                  row.label
                }
              >
                {row.value}
              </b>,
              target,
            )
          : null,
      )}
      {liveTarget &&
        live &&
        createPortal(
          <span className="lv-admin-top-live">
            {states.live.value?.mode === 'demo' ? 'Demo · ' : ''}
            {live.rows[0]?.value.toLocaleString('en-NG')} lots live ·{' '}
            {live.rows[1]?.value.toLocaleString('en-NG')} end in the next hour
          </span>,
          liveTarget,
        )}
      <header className="lv-admin-overview-heading lv-staff-heading">
        <div>
          <h1>
            Good {hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'},{' '}
            {name.split(' ')[0]}
          </h1>
          <p>
            {dates} · figures for {period}
            {previous
              ? `, compared with ${previous.from} – ${previous.to}`
              : ', no comparison'}{' '}
            ·{' '}
            {minutes === null
              ? 'awaiting snapshot'
              : minutes === 0
                ? 'updated just now'
                : `updated ${minutes} min ago`}
          </p>
        </div>
        <div className="lv-admin-overview-controls">
          <DateRangeControl
            value={query}
            preset={preset}
            onPreset={(value) =>
              value === 'custom'
                ? change(query, value)
                : change({ ...query, ...overviewRange(value) }, value)
            }
            onChange={(value) => change(value)}
          />
          <button
            type="button"
            className="lv-admin-control"
            disabled={!states.kpis.value?.data?.kpis.length}
            onClick={() =>
              exportRows(
                (demo ? 'demo-' : '') + 'overview',
                [
                  'Metric',
                  'Value (money in kobo; percentages in basis points)',
                  'Previous',
                  'From (WAT)',
                  'To (WAT)',
                ],
                states.kpis.value?.data?.kpis.map((row) => [
                  row.id,
                  row.value,
                  row.previous,
                  query.from,
                  query.to,
                ]) ?? [],
              )
            }
          >
            <Download size={16} />
            Export
          </button>
          {permissions.includes('pickup.manage') && (
            <button
              type="button"
              className="lv-admin-check-in"
              onClick={onCheckIn}
            >
              <ScanLine size={17} />
              Check in a buyer
            </button>
          )}
        </div>
      </header>
      {demo && (
        <div className="lv-admin-demo-notice" role="note">
          <strong>Demo analytics preview</strong> · Sample figures, separate
          from real sales, wallets and requests. Widgets marked Demo do not
          describe live operations.
        </div>
      )}
      {!online && (
        <div className="lv-admin-widget-error" role="alert">
          You are offline. Last confirmed snapshots are shown.
        </div>
      )}
      {rangeError && (
        <div className="lv-admin-widget-error" role="alert">
          {rangeError}
        </div>
      )}
      <AlertStrip state={states.attention} onOpen={open} />
      {full ? (
        <KpiGrid state={states.kpis} onReport={setReport} />
      ) : (
        <p className="lv-admin-role-context">
          Your {role} workspace · only authorised operational queues are shown.
        </p>
      )}
      {!full && permissions.includes('auctions.manage') && (
        <WidgetFrame
          title="Live right now"
          subtitle="Current snapshot, independent of the date range"
          state={states.live}
        >
          {(data) => (
            <LiveSummary data={data} onOpen={() => open('auctions')} />
          )}
        </WidgetFrame>
      )}
      {full && (
        <div className="lv-admin-row is-primary">
          <WidgetFrame
            title="Net revenue per day"
            subtitle={period + ' · service charges and fees, excluding VAT'}
            state={states.revenue}
            action={
              <div
                className="lv-admin-grain"
                role="group"
                aria-label="Chart granularity"
              >
                {['day', 'week', 'month'].map((grain) => (
                  <button
                    type="button"
                    key={grain}
                    aria-pressed={query.grain === grain}
                    disabled={
                      overviewPointCount({
                        ...query,
                        grain: grain as OverviewQuery['grain'],
                      }) > 400
                    }
                    onClick={() =>
                      change({
                        ...query,
                        grain: grain as OverviewQuery['grain'],
                      })
                    }
                  >
                    {grain[0]?.toUpperCase() + grain.slice(1)}
                  </button>
                ))}
              </div>
            }
          >
            {(data) => (
              <ChartPanel
                data={data}
                label="Net revenue per day"
                demo={states.revenue.value?.mode === 'demo'}
              />
            )}
          </WidgetFrame>
          <WidgetFrame
            title="Live right now"
            subtitle="Current snapshot · ignores selected date range. Every lot runs on its own countdown."
            state={states.live}
            action={
              states.live.value?.data?.rows.length ? (
                <span className="lv-admin-live-pill">
                  {(states.live.value.data.rows[0]?.value ?? 0) > 0
                    ? 'Live'
                    : 'No auctions running'}
                </span>
              ) : undefined
            }
          >
            {(data) => (
              <LiveSummary data={data} onOpen={() => open('auctions')} />
            )}
          </WidgetFrame>
        </div>
      )}
      {full && (
        <div className="lv-admin-row is-halves">
          <WidgetFrame
            title="GMV by category"
            subtitle={'Hammer total of sold lots · ' + period}
            state={states.categories}
            action={
              <button
                type="button"
                className="lv-admin-text-link"
                onClick={() => setReport('gmv')}
              >
                Full report
              </button>
            }
          >
            {(data) => <CategoryBars data={data} />}
          </WidgetFrame>
          <WidgetFrame
            title="From listing to collection"
            subtitle="Where lots drop out between going live and leaving the warehouse"
            state={states.funnel}
          >
            {(data) => <Funnel data={data} />}
          </WidgetFrame>
        </div>
      )}
      <div className={'lv-admin-row ' + (full ? 'is-thirds' : 'is-halves')}>
        <WidgetFrame
          title="Needs attention"
          subtitle="Current work queue · refreshes every 30 seconds"
          state={states.attention}
        >
          {(data) => <AttentionQueue data={data} onOpen={open} />}
        </WidgetFrame>
        {full && (
          <WidgetFrame
            title="Top lots this period"
            state={states['top-lots']}
            action={action('See all', 'auctions')}
          >
            {(data) => <TopLots data={data} />}
          </WidgetFrame>
        )}
        {permissions.includes('audit.read') && (
          <WidgetFrame
            title="Recent activity"
            state={states.activity}
            action={action('Audit log', 'audit')}
          >
            {(data) => <ActivityFeed data={data} />}
          </WidgetFrame>
        )}
      </div>
      {full && (
        <div className="lv-admin-row is-bottom">
          <WidgetFrame
            title="Unsold stock by age"
            subtitle="Current unsold stock · cost values where recorded"
            state={states['stock-age']}
          >
            {(data) => (
              <>
                <StockAge data={data} />
                <footer>{action('Review unsold stock', 'inventory')}</footer>
              </>
            )}
          </WidgetFrame>
          <WidgetFrame
            title="Net revenue and expenses by month"
            subtitle="Last 12 months ending in the selected period"
            state={states['monthly-finance']}
          >
            {(data) => (
              <ChartPanel
                data={data}
                monthly
                label="Net revenue and expenses by month"
                demo={states['monthly-finance'].value?.mode === 'demo'}
              />
            )}
          </WidgetFrame>
        </div>
      )}
    </div>
  );
}
