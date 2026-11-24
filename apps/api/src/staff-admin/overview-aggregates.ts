import {
  fromLedgerKobo,
  overviewDataSchema,
  overviewResponseSchema,
  recoveryPercent,
  shiftDay,
  type OverviewData,
  type OverviewQuery,
  type OverviewWidget,
} from '@auction-ng/shared';
import { COST_SQL } from '../batches/batch-recalc';
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

const stockByAge = (tx: Prisma.TransactionClient) =>
  tx.$queryRaw<
    {
      label: string;
      items: bigint;
      cost: bigint | null;
      tone: 'info' | 'warning' | 'danger';
    }[]
  >`
    SELECT band.label, band.tone, count(c.lot_id) AS items, sum(c.unit_cost_kobo)::bigint AS cost
    FROM (VALUES (1, '0–7 days', 'info', 0, 8), (2, '8–30 days', 'info', 8, 31),
      (3, '31–60 days', 'warning', 31, 61), (4, 'Over 60 days', 'danger', 61, 100000))
      AS band(position, label, tone, from_day, to_day)
    LEFT JOIN lot_costs c ON c.item_state = 'unsold'
      AND EXTRACT(EPOCH FROM now() - c.item_since) / 86400 >= band.from_day
      AND EXTRACT(EPOCH FROM now() - c.item_since) / 86400 < band.to_day
    GROUP BY band.position, band.label, band.tone ORDER BY band.position`;
/** Selling and closed batches only: what they cost and what came back. */
const supplierRecovery = (tx: Prisma.TransactionClient) =>
  tx.$queryRaw<{ name: string; cost: bigint; back: bigint; batches: bigint }[]>`
    SELECT sp.name, sum(${COST_SQL})::bigint AS cost,
      COALESCE(sum(st.money_back_kobo), 0)::bigint AS back, count(*) AS batches
    FROM batches b JOIN suppliers sp ON sp.id = b.supplier_id
    LEFT JOIN batch_stats st ON st.batch_id = b.id
    WHERE b.status IN ('selling','closed')
    GROUP BY sp.id, sp.name ORDER BY 2 DESC, 1 LIMIT 20`;

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
  if (widget === 'monthly-finance')
    return unavailable('Expense records have not been implemented yet.');
  // From inventory batches: kept up to date by the batch recalculation job.
  if (widget === 'stock-age' || widget === 'supplier-recovery') {
    const rows =
      widget === 'stock-age'
        ? (await stockByAge(tx)).map((r) => ({
            label: r.label,
            value: number(r.items),
            secondary: number(r.cost ?? 0n),
            tone: r.tone,
          }))
        : (await supplierRecovery(tx)).map((r) => ({
            label: r.name,
            value: recoveryPercent(number(r.back), number(r.cost)) ?? 0,
            secondary: number(r.cost),
            tone: r.back >= r.cost ? ('success' as const) : ('danger' as const),
            detail: `${number(r.batches)} ${r.batches === 1n ? 'batch' : 'batches'}`,
          }));
    return overviewResponseSchema.parse({
      widget,
      mode: 'aggregate',
      updatedAt: new Date().toISOString(),
      data: { ...empty(), rows },
    });
  }
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
