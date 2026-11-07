import {
  fromLedgerKobo,
  overviewDataSchema,
  overviewResponseSchema,
  shiftDay,
  type OverviewData,
  type OverviewQuery,
  type OverviewWidget,
} from '@auction-ng/shared';
import type { Prisma } from '../generated/prisma/client';
import { z } from 'zod';
const snapshotPayload = z
  .object({
    backlog: z.number().int().safe().nonnegative(),
    live: overviewDataSchema,
    attention: overviewDataSchema,
    activity: overviewDataSchema,
  })
  .strict();

export type DailyMetric = {
  day: string;
  revenue: bigint;
  gmv: bigint;
  sold: bigint;
  closed: bigint;
  listed: bigint;
  bidLots: bigint;
  cohortSold?: bigint;
  paid: bigint;
  collected: bigint;
};
const number = (value: bigint) =>
  value < 0n ? -fromLedgerKobo(-value) : fromLedgerKobo(value);
const empty = (): OverviewData => ({ rows: [], series: [], kpis: [] });
function totals(rows: DailyMetric[]) {
  return rows.reduce(
    (sum, row) => ({
      revenue: sum.revenue + row.revenue,
      gmv: sum.gmv + row.gmv,
      sold: sum.sold + row.sold,
      closed: sum.closed + row.closed,
      listed: sum.listed + row.listed,
      bidLots: sum.bidLots + row.bidLots,
      cohortSold: sum.cohortSold + (row.cohortSold ?? 0n),
      paid: sum.paid + row.paid,
      collected: sum.collected + row.collected,
    }),
    {
      revenue: 0n,
      gmv: 0n,
      sold: 0n,
      closed: 0n,
      listed: 0n,
      bidLots: 0n,
      cohortSold: 0n,
      paid: 0n,
      collected: 0n,
    },
  );
}
export function buildAggregateOverview(
  widget: OverviewWidget,
  query: OverviewQuery,
  input: DailyMetric[],
  bidders: bigint,
  backlog: bigint,
): OverviewData {
  const rows = input.filter(
    (row) => row.day >= query.from && row.day <= query.to,
  );
  const sum = totals(rows),
    data = empty();
  if (widget === 'kpis') {
    const values = {
      netRevenue: sum.revenue,
      gmv: sum.gmv,
      lotsSold: sum.sold,
      sellThrough: sum.closed
        ? (sum.sold * 10000n + sum.closed / 2n) / sum.closed
        : 0n,
      activeBidders: bidders,
      pickupBacklog: backlog,
    };
    data.kpis = (Object.keys(values) as (keyof typeof values)[]).map((id) => ({
      id,
      value: number(values[id]),
      previous: null,
      sparkline:
        id === 'netRevenue' || id === 'gmv' || id === 'lotsSold'
          ? rows
              .slice(-32)
              .map((row) =>
                number(
                  id === 'netRevenue'
                    ? row.revenue
                    : id === 'gmv'
                      ? row.gmv
                      : row.sold,
                ),
              )
          : [],
    }));
  }
  if (widget === 'revenue') {
    const days = new Map(rows.map((row) => [row.day, row.revenue]));
    const buckets = new Map<string, bigint>();
    for (let day = query.from; day <= query.to; day = shiftDay(day, 1)) {
      const offset = (new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7;
      const key =
        query.grain === 'month'
          ? day.slice(0, 7)
          : query.grain === 'week'
            ? shiftDay(day, -offset)
            : day;
      buckets.set(key, (buckets.get(key) ?? 0n) + (days.get(day) ?? 0n));
    }
    data.series = [...buckets].map(([day, value]) => ({
      day,
      value: number(value),
      previous: null,
    }));
  }
  if (widget === 'funnel')
    data.rows = (
      [
        ['Went live', sum.listed],
        ['Got a bid', sum.bidLots],
        ['Sold', sum.cohortSold],
        ['Paid', sum.paid],
        ['Collected', sum.collected],
      ] as const
    ).map(([label, value]) => ({
      label,
      value: number(value),
      tone: label === 'Collected' ? 'success' : 'info',
    }));
  return overviewDataSchema.parse(data);
}

type Snapshot = { generatedAt: Date; metricsAt: Date | null; payload: unknown };
export async function readAggregateOverview(
  tx: Prisma.TransactionClient,
  widget: OverviewWidget,
  query: OverviewQuery,
) {
  const snapshots = await tx.$queryRaw<
    Snapshot[]
  >`SELECT generated_at AS "generatedAt", metrics_at AS "metricsAt", payload FROM analytics_snapshots WHERE id=1`;
  const snapshot = snapshots[0];
  const unavailable = (message: string) =>
    overviewResponseSchema.parse({
      widget,
      mode: 'unavailable',
      updatedAt:
        snapshot?.generatedAt.toISOString() ?? new Date().toISOString(),
      message,
    });
  if (!snapshot)
    return unavailable(
      'Analytics are preparing their first snapshot. They will appear automatically.',
    );
  if (['stock-age', 'monthly-finance'].includes(widget))
    return unavailable(
      widget === 'stock-age'
        ? 'Stock cost and valuation records have not been implemented yet.'
        : 'Expense records have not been implemented yet.',
    );
  if (query.compare !== 'none')
    return unavailable(
      'Comparison is not enabled for actual-data analytics yet. Choose no comparison.',
    );
  const payload = snapshotPayload.parse(snapshot.payload);
  let data: OverviewData;
  const operational = ['live', 'attention', 'activity'].includes(widget);
  if (widget === 'live' || widget === 'attention' || widget === 'activity')
    data = payload[widget];
  else {
    if (!snapshot.metricsAt)
      return unavailable(
        'Historical aggregates are preparing. They will appear automatically.',
      );
    if (widget === 'categories') {
      const rows = await tx.$queryRaw<
        { label: string; value: bigint }[]
      >`WITH grouped AS (SELECT category AS label,sum(gmv)::bigint AS value FROM analytics_category_daily WHERE day BETWEEN ${query.from}::date AND ${query.to}::date GROUP BY category), ranked AS (SELECT label,value,row_number() OVER (ORDER BY value DESC,label) AS position FROM grouped) SELECT CASE WHEN position>49 THEN 'Other categories' ELSE label END AS label,sum(value)::bigint AS value FROM ranked GROUP BY 1 ORDER BY value DESC,label LIMIT 50`;
      data = {
        ...empty(),
        rows: rows.map((row) => ({
          label: row.label,
          value: number(row.value),
        })),
      };
    } else if (widget === 'top-lots') {
      const rows = await tx.$queryRaw<
        {
          label: string;
          reference: string;
          value: bigint;
          accepted: bigint;
          retail: bigint;
        }[]
      >`SELECT title AS label, lot_number AS reference, hammer AS value, accepted, retail FROM analytics_lot_facts WHERE won AND closed_day BETWEEN ${query.from}::date AND ${query.to}::date ORDER BY hammer DESC, id LIMIT 6`;
      data = {
        ...empty(),
        rows: rows.map((row) => ({
          label: row.label,
          reference: row.reference,
          value: number(row.value),
          detail: number(row.accepted) + ' accepted bids',
          ...(row.retail > 0n
            ? {
                secondary: number(
                  (row.value * 10000n + row.retail / 2n) / row.retail,
                ),
              }
            : {}),
        })),
      };
    } else {
      const daily = await tx.$queryRaw<
        DailyMetric[]
      >`SELECT day::text, revenue, gmv, sold, closed, listed, bid_lots AS "bidLots", cohort_sold AS "cohortSold", paid, collected FROM metrics_daily WHERE day BETWEEN ${query.from}::date AND ${query.to}::date ORDER BY day`;
      const [distinct] =
        widget === 'kpis'
          ? await tx.$queryRaw<
              { value: bigint }[]
            >`SELECT count(DISTINCT bidder)::bigint AS value FROM analytics_bidder_daily WHERE day BETWEEN ${query.from}::date AND ${query.to}::date`
          : [{ value: 0n }];
      const backlog = BigInt(payload.backlog);
      data = buildAggregateOverview(
        widget,
        query,
        daily,
        distinct?.value ?? 0n,
        backlog,
      );
    }
  }
  return overviewResponseSchema.parse({
    widget,
    mode: 'aggregate',
    updatedAt: (operational
      ? snapshot.generatedAt
      : (snapshot.metricsAt ?? snapshot.generatedAt)
    ).toISOString(),
    data,
  });
}
