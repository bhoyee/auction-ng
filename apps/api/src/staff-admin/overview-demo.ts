import {
  overviewDataSchema,
  overviewMetrics,
  shiftDay,
  type OverviewData,
  type OverviewQuery,
  type OverviewWidget,
} from '@auction-ng/shared';

export function overviewDemoAllowed(env: {
  ADMIN_OVERVIEW_DEMO_ENABLED?: string;
  DEPLOYMENT_ENV?: string;
}) {
  return (
    env.ADMIN_OVERVIEW_DEMO_ENABLED === 'true' && env.DEPLOYMENT_ENV === 'local'
  );
}

// Synthetic visual-review fixtures only. Never inserted into auctions, invoices, the ledger or audit history.
export function buildOverviewDemo(
  widget: OverviewWidget,
  query: OverviewQuery,
): OverviewData {
  const length =
    Math.round((Date.parse(query.to) - Date.parse(query.from)) / 86400000) + 1;
  const grouped = new Map<
    string,
    { day: string; value: number; previous: number | null }
  >();
  const fallbackStep = Math.max(1, Math.ceil(length / 400));
  for (let i = 0; i < Math.min(length, 36600); i++) {
    const date = shiftDay(query.from, i);
    const weekOffset = (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7;
    const key =
      query.grain === 'month'
        ? date.slice(0, 7)
        : query.grain === 'week'
          ? shiftDay(date, -weekOffset)
          : shiftDay(query.from, Math.floor(i / fallbackStep) * fallbackStep);
    const row = grouped.get(key) ?? {
      day: key,
      value: 0,
      previous: query.compare === 'none' ? null : 0,
    };
    row.value += (430000 + ((i * 1371) % 4100) * 100) * 100;
    if (row.previous !== null)
      row.previous += (400000 + ((i * 1137) % 3800) * 100) * 100;
    grouped.set(key, row);
  }
  const series = [...grouped.values()];
  const total = series.reduce((sum, point) => sum + point.value, 0);
  const previous =
    query.compare === 'none'
      ? null
      : series.reduce((sum, point) => sum + (point.previous ?? 0), 0);
  const scale = Math.max(1, length / 30);
  const data: OverviewData = { rows: [], series: [], kpis: [] };
  const categoryValues = [
    2410000000, 1860000000, 1420000000, 1090000000, 980000000, 740000000,
    610000000, 570000000,
  ].map((v) => Math.round(v * scale));
  if (widget === 'kpis') {
    const values = [
      total,
      categoryValues.reduce((sum, v) => sum + v, 0),
      Math.round(6412 * scale),
      8730,
      Math.round(4918 * scale),
      612,
    ];
    data.kpis = (
      Object.keys(overviewMetrics) as (keyof typeof overviewMetrics)[]
    ).map((id, i) => ({
      id,
      value: values[i] ?? 0,
      previous:
        query.compare === 'none'
          ? null
          : i === 0
            ? previous
            : Math.round((values[i] ?? 0) / (i === 5 ? 1.084 : 1.124)),
      sparkline: Array.from(
        { length: 12 },
        (_, j) => 30 + j * 3 + ((j * 13 + i * 7) % 17),
      ),
    }));
  }
  if (widget === 'revenue') data.series = series;
  if (widget === 'live') {
    data.rows = [
      { label: 'Lots live', value: 3412 },
      { label: 'Ending in the next hour', value: 148 },
      { label: 'Ending in 24 hours', value: 2206 },
      { label: 'Published today', value: 412 },
      { label: 'GMV in the last 24 hours', value: 341000000 },
      { label: 'Sold in the last 24 hours', value: 8900 },
    ];
    data.series = Array.from({ length: 24 }, (_, i) => ({
      day: `${i}:00`,
      value: 2600 + Math.round(7000 * Math.exp(-((i - 15) ** 2) / 28)) + i * 15,
      previous: null,
    }));
  }
  if (widget === 'categories')
    data.rows = [
      'Phones',
      'Electronics',
      'Home appliances',
      'Kitchen',
      'Computers',
      'Fashion',
      'Furniture',
      'Other',
    ].map((label, i) => ({ label, value: categoryValues[i] ?? 0 }));
  if (widget === 'funnel')
    data.rows = ['Went live', 'Got a bid', 'Sold', 'Paid', 'Collected'].map(
      (label, i) => ({
        label,
        value: Math.round(([7345, 6690, 6412, 6148, 5536][i] ?? 0) * scale),
        tone: i === 4 ? 'success' : 'info',
      }),
    );
  if (widget === 'attention')
    data.rows = [
      {
        label: 'Overdue pickups',
        value: 28,
        detail: 'Oldest 9 working days',
        tone: 'danger',
        destination: 'pickup',
      },
      {
        label: 'Items to prepare for pickup',
        value: 14,
        detail: 'Oldest 1 day',
        tone: 'warning',
        destination: 'pickup',
      },
      {
        label: 'Draft lots to publish',
        value: 86,
        detail: 'Oldest 2 days',
        tone: 'warning',
        destination: 'inventory',
      },
      {
        label: 'Refunds awaiting approval',
        value: 3,
        detail: '3 requests awaiting review',
        tone: 'warning',
        destination: 'finance',
      },
      {
        label: 'Unmatched top-ups',
        value: 3,
        detail: 'Reconciliation exceptions',
        tone: 'warning',
        destination: 'finance',
      },
      {
        label: 'Open disputes',
        value: 7,
        detail: '2 past response target',
        tone: 'danger',
        destination: 'support',
      },
      {
        label: 'Fraud flags to review',
        value: 4,
        detail: 'Account review needed',
        tone: 'info',
        destination: 'buyers',
      },
    ];
  if (widget === 'top-lots')
    data.rows = [
      'HP EliteBook 840 G8, Core i7',
      'Samsung 55-inch Crystal UHD TV',
      'iPhone 13, 128GB, open box',
      'LG double-door fridge, 420L',
      'PlayStation 5 with 2 controllers',
      'Haier Thermocool 1.5HP split AC',
    ].map((label, i) => ({
      label,
      value:
        [41200000, 36800000, 33500000, 29800000, 28750000, 24100000][i] ?? 0,
      reference: 'DEMO-' + String(19802 + i),
      detail: `${58 - i * 4} bids`,
      secondary: 6100 - i * 300,
    }));
  if (widget === 'activity')
    data.rows = [
      {
        label: 'Tunde Adeyemi refunded an order',
        value: 4,
        detail: 'DEMO-INV-A72K9P4X · item damaged',
        reference: 'TA',
      },
      {
        label: 'Halima Bello published 42 lots',
        value: 18,
        detail: '36-hour run time',
        reference: 'HB',
      },
      {
        label: 'Chika Nwosu confirmed collection',
        value: 26,
        detail: 'DEMO-INV-F83L2R6D · Ikeja',
        reference: 'CN',
      },
      {
        label: 'System completed reconciliation',
        value: 60,
        detail: 'No exceptions in this sample batch',
        reference: 'SY',
      },
      {
        label: 'Emeka Obi reviewed a buyer account',
        value: 120,
        detail: 'Account access updated',
        reference: 'EO',
      },
      {
        label: 'Ada Okafor approved an expense',
        value: 180,
        detail: 'DEMO-EXP-Q37W6T2K · diesel',
        reference: 'AO',
      },
    ];
  if (widget === 'stock-age')
    data.rows = [
      { label: '0–7 days', value: 2140, secondary: 1820000000, tone: 'info' },
      { label: '8–30 days', value: 1605, secondary: 1490000000, tone: 'info' },
      {
        label: '31–60 days',
        value: 418,
        secondary: 460000000,
        tone: 'warning',
      },
      {
        label: 'Over 60 days',
        value: 127,
        secondary: 190000000,
        tone: 'danger',
      },
    ];
  if (widget === 'monthly-finance')
    data.series = Array.from({ length: 12 }, (_, i) => ({
      day: new Date(
        Date.UTC(
          Number(query.to.slice(0, 4)),
          Number(query.to.slice(5, 7)) - 12 + i,
          1,
        ),
      )
        .toISOString()
        .slice(0, 7),
      value: 580000000 + i * 110000000,
      previous: null,
      extra: 420000000 + i * 32000000,
    }));
  return overviewDataSchema.parse(data);
}
