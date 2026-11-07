import {
  fromLedgerKobo,
  overviewDataSchema,
  overviewRefreshReportSchema,
} from '@auction-ng/shared';
import type { LedgerService } from '../ledger/ledger-service';

export class OverviewMaintenance {
  constructor(private readonly ledger: LedgerService) {}
  async refresh(history: boolean) {
    return this.ledger.db.$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRaw<
          { locked: boolean }[]
        >`SELECT pg_try_advisory_xact_lock(781147019) AS locked`;
        if (!lock?.locked)
          return overviewRefreshReportSchema.parse({ status: 'busy' });
        await tx.$executeRaw`SET LOCAL statement_timeout = '30s'`;
        const now = new Date();
        const [previous] = await tx.$queryRaw<
          { metricsAt: Date | null }[]
        >`SELECT metrics_at AS "metricsAt" FROM analytics_snapshots WHERE id=1`;
        const historical = history || !previous?.metricsAt;
        if (historical) {
          // Names are a fixed allow-list, never operator/client input. A failed refresh
          // rolls back every projection and timestamp, retaining the previous generation.
          for (const name of [
            'analytics_lot_facts',
            'metrics_daily',
            'analytics_category_daily',
            'analytics_bidder_daily',
          ])
            await tx.$executeRawUnsafe(
              'REFRESH MATERIALIZED VIEW CONCURRENTLY ' + name,
            );
        }
        const [counts] = await tx.$queryRaw<
          { live: bigint; hour: bigint; day: bigint; published: bigint }[]
        >`
        SELECT count(*) FILTER (WHERE status='open' AND start_at <= ${now}::timestamptz AND end_at > ${now}::timestamptz)::bigint AS live,
          count(*) FILTER (WHERE status='open' AND start_at <= ${now}::timestamptz AND end_at > ${now}::timestamptz AND end_at <= ${now}::timestamptz + interval '1 hour')::bigint AS hour,
          count(*) FILTER (WHERE status='open' AND start_at <= ${now}::timestamptz AND end_at > ${now}::timestamptz AND end_at <= ${now}::timestamptz + interval '24 hours')::bigint AS day,
          count(*) FILTER (WHERE status NOT IN ('draft','scheduled') AND start_at <= ${now}::timestamptz AND start_at >= date_trunc('day', ${now}::timestamptz AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos')::bigint AS published
        FROM lots WHERE archived_at IS NULL AND (status='open' OR start_at >= date_trunc('day', ${now}::timestamptz AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos')`;
        const [sold] = await tx.$queryRaw<
          { gmv: bigint; won: bigint; closed: bigint }[]
        >`SELECT COALESCE(sum(hammer_kobo) FILTER (WHERE winner_id IS NOT NULL),0)::bigint AS gmv, count(*) FILTER (WHERE winner_id IS NOT NULL)::bigint AS won, count(*)::bigint AS closed FROM lot_settlements WHERE end_at >= ${now}::timestamptz - interval '24 hours' AND end_at <= ${now}::timestamptz`;
        const hourly = await tx.$queryRaw<
          { hour: Date; value: bigint }[]
        >`SELECT date_trunc('hour', created_at) AS hour, count(*)::bigint AS value FROM bid_acceptances WHERE created_at >= date_trunc('hour', ${now}::timestamptz) - interval '23 hours' AND created_at <= ${now}::timestamptz GROUP BY 1`;
        const [backlog] = await tx.$queryRaw<
          { value: bigint }[]
        >`SELECT count(*)::bigint AS value FROM invoice_lines il JOIN invoices i ON i.id=il.invoice_id JOIN fulfilments f ON f.invoice_id=i.id LEFT JOIN pickup_collection_items pc ON pc.invoice_line_id=il.id WHERE i.status='paid' AND f.type='pickup' AND f.status IN ('pending','booked','ready') AND f.collected_at IS NULL AND pc.invoice_line_id IS NULL`;
        const [queues] = await tx.$queryRaw<
          {
            drafts: bigint;
            overdue: bigint;
            withdrawals: bigint;
            tickets: bigint;
          }[]
        >`SELECT
        (SELECT count(*) FROM lots WHERE status='draft' AND archived_at IS NULL)::bigint AS drafts,
        (SELECT count(*) FROM pickup_storage_cases sc JOIN invoice_lines il ON il.id=sc.invoice_line_id JOIN invoices i ON i.id=il.invoice_id WHERE sc.collected_at IS NULL AND sc.due_at < ${now}::timestamptz AND i.status='paid')::bigint AS overdue,
        (SELECT count(*) FROM withdrawals WHERE status='review')::bigint AS withdrawals,
        (SELECT count(*) FROM support_conversations WHERE status IN ('open','in_progress'))::bigint AS tickets`;
        const activity = await tx.$queryRaw<
          { action: string; type: string; at: Date }[]
        >`SELECT action, entity_type AS type, created_at AS at FROM audit_log ORDER BY created_at DESC, id DESC LIMIT 6`;
        const n = (value: bigint | undefined) => fromLedgerKobo(value ?? 0n);
        const hours = new Map(
          hourly.map((row) => [row.hour.getTime(), n(row.value)]),
        );
        const hour = Math.floor(now.getTime() / 3600000) * 3600000;
        const live = overviewDataSchema.parse({
          rows: [
            { label: 'Lots live', value: n(counts?.live) },
            { label: 'Ending in the next hour', value: n(counts?.hour) },
            { label: 'Ending in 24 hours', value: n(counts?.day) },
            { label: 'Published today', value: n(counts?.published) },
            { label: 'GMV in the last 24 hours', value: n(sold?.gmv) },
            {
              label: 'Sold in the last 24 hours',
              value: sold?.closed
                ? n((sold.won * 10000n + sold.closed / 2n) / sold.closed)
                : 0,
            },
          ],
          series: Array.from({ length: 24 }, (_, index) => {
            const at = hour - (23 - index) * 3600000;
            return {
              day: new Date(at + 3600000).toISOString().slice(11, 16),
              value: hours.get(at) ?? 0,
              previous: null,
            };
          }),
        });
        const attention = overviewDataSchema.parse({
          rows: [
            {
              label: 'Overdue pickups',
              value: n(queues?.overdue),
              tone: 'danger',
              destination: 'pickup',
            },
            {
              label: 'Draft lots to publish',
              value: n(queues?.drafts),
              tone: 'warning',
              destination: 'inventory',
            },
            {
              label: 'Withdrawals awaiting review',
              value: n(queues?.withdrawals),
              tone: 'warning',
              destination: 'finance',
            },
            {
              label: 'Open support tickets',
              value: n(queues?.tickets),
              tone: 'info',
              destination: 'support',
            },
          ],
        });
        const feed = overviewDataSchema.parse({
          rows: activity.map((row) => ({
            label: row.action.replaceAll('_', ' '),
            detail: row.type,
            reference: 'ST',
            value: Math.max(
              0,
              Math.floor((now.getTime() - row.at.getTime()) / 60000),
            ),
          })),
        });
        const payload = JSON.stringify({
          live,
          attention,
          activity: feed,
          backlog: n(backlog?.value),
        });
        const metricsAt = historical ? now : (previous?.metricsAt ?? null);
        await tx.$executeRaw`INSERT INTO analytics_snapshots (id,generated_at,metrics_at,payload) VALUES (1,${now}::timestamptz,${metricsAt},${payload}::jsonb) ON CONFLICT (id) DO UPDATE SET generated_at=EXCLUDED.generated_at,metrics_at=EXCLUDED.metrics_at,payload=EXCLUDED.payload`;
        return overviewRefreshReportSchema.parse({
          status: 'refreshed',
          generatedAt: now.toISOString(),
        });
      },
      { isolationLevel: 'RepeatableRead', timeout: 120000, maxWait: 5000 },
    );
  }
}
