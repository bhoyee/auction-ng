import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import {
  lotStages,
  lotTabs,
  type LotListFilters,
  type LotStage,
  type LotTab,
} from '@auction-ng/shared';
import { Prisma } from '../generated/prisma/client';

type Tx = Prisma.TransactionClient;
const sql = Prisma.sql;
const join = Prisma.join;
const empty = Prisma.empty;

// Lots list (T15e). A fixed number of queries per page: tab counts, summary
// cards, page IDs by sort key, then the 50 rows' details.

// A lot whose pre-bids are launching is already in the bid engine: live.
export const STAGE_SQL = sql`CASE
  WHEN l.pre_bids_launching THEN 'live'
  WHEN l.status = 'draft' THEN 'draft'
  WHEN l.status = 'scheduled' THEN 'scheduled'
  WHEN l.status IN ('open','closing') THEN 'live'
  WHEN l.status = 'cancelled' THEN 'cancelled'
  WHEN s.status IN ('paid','frozen','payment_due') THEN 'sold'
  ELSE 'unsold' END`;

const FROM = sql`FROM lots l
  JOIN categories c ON c.id = l.category_id
  LEFT JOIN bins b ON b.id = l.bin_id
  LEFT JOIN suppliers sp ON sp.id = l.supplier_id
  LEFT JOIN lot_settlements s ON s.lot_id = l.id`;

const tabSql: Record<LotTab, Prisma.Sql> = {
  all: sql`l.deleted_at IS NULL AND l.archived_at IS NULL`,
  drafts: sql`l.deleted_at IS NULL AND l.archived_at IS NULL AND l.status = 'draft'`,
  scheduled: sql`l.deleted_at IS NULL AND l.archived_at IS NULL AND l.status = 'scheduled'`,
  live: sql`l.deleted_at IS NULL AND l.archived_at IS NULL AND l.status IN ('open','closing')`,
  ending: sql`l.deleted_at IS NULL AND l.archived_at IS NULL AND l.status IN ('open','closing') AND l.end_at <= now() + interval '24 hours'`,
  sold: sql`l.deleted_at IS NULL AND l.archived_at IS NULL AND l.status = 'closed' AND s.status IN ('paid','frozen','payment_due')`,
  unsold: sql`l.deleted_at IS NULL AND l.archived_at IS NULL AND l.status = 'closed' AND (s.status IS NULL OR s.status NOT IN ('paid','frozen','payment_due'))`,
  archived: sql`l.deleted_at IS NULL AND l.archived_at IS NOT NULL`,
  deleted: sql`l.deleted_at IS NOT NULL`,
};

/** WAT calendar date → the UTC instant its day starts. */
const watDayStart = (date: string) => new Date(`${date}T00:00:00+01:00`);

export function filterSql(f: LotListFilters) {
  const parts: Prisma.Sql[] = [];
  if (f.search) {
    const like = `%${f.search.replace(/[\\%_]/g, '\\$&')}%`;
    parts.push(
      sql`(l.title ILIKE ${like} OR l.lot_number ILIKE ${like} OR b.code ILIKE ${like} OR sp.name ILIKE ${like})`,
    );
  }
  if (f.categoryIds?.length)
    parts.push(
      sql`(l.category_id IN (${join(f.categoryIds.map((id) => sql`${id}::uuid`))}) OR c.parent_id IN (${join(f.categoryIds.map((id) => sql`${id}::uuid`))}))`,
    );
  if (f.locationIds?.length)
    parts.push(
      sql`l.location_id IN (${join(f.locationIds.map((id) => sql`${id}::uuid`))})`,
    );
  if (f.supplierIds?.length)
    parts.push(
      sql`l.supplier_id IN (${join(f.supplierIds.map((id) => sql`${id}::uuid`))})`,
    );
  if (f.addedByIds?.length)
    parts.push(
      sql`l.created_by_id IN (${join(f.addedByIds.map((id) => sql`${id}::uuid`))})`,
    );
  if (f.conditions?.length)
    parts.push(sql`l.condition IN (${join(f.conditions)})`);
  if (f.runTimeMinutes)
    parts.push(
      sql`COALESCE(l.run_time_minutes, (EXTRACT(EPOCH FROM l.end_at - l.start_at) / 60)::int) = ${f.runTimeMinutes}`,
    );
  if (f.addedFrom) parts.push(sql`l.created_at >= ${watDayStart(f.addedFrom)}`);
  if (f.addedTo)
    parts.push(
      sql`l.created_at < ${new Date(watDayStart(f.addedTo).getTime() + 86_400_000)}`,
    );
  if (f.priceMinKobo !== undefined)
    parts.push(sql`l.start_price_kobo >= ${BigInt(f.priceMinKobo)}`);
  if (f.priceMaxKobo !== undefined)
    parts.push(sql`l.start_price_kobo <= ${BigInt(f.priceMaxKobo)}`);
  if (f.binId === 'none') parts.push(sql`l.bin_id IS NULL`);
  else if (f.binId) parts.push(sql`l.bin_id = ${f.binId}::uuid`);
  return parts.length ? sql`AND ${join(parts, ' AND ')}` : empty;
}

export async function tabCounts(
  tx: Tx,
  f: LotListFilters,
  canSeeDeleted: boolean,
) {
  const where = filterSql(f);
  const [row] = await tx.$queryRaw<Record<string, bigint>[]>`
    SELECT ${join(
      lotTabs.map(
        (t) =>
          sql`count(*) FILTER (WHERE ${t === 'deleted' && !canSeeDeleted ? sql`false` : tabSql[t]}) AS ${Prisma.raw(`"${t}"`)}`,
      ),
    )}
    ${FROM} WHERE true ${where}`;
  return Object.fromEntries(
    lotTabs.map((t) => [t, Number(row?.[t] ?? 0)]),
  ) as Record<LotTab, number>;
}

// Summary cards don't depend on filters; two plain scans (lots, then auction
// results) and a short cache keep them cheap on every list request.
let cached: {
  at: number;
  value: Awaited<ReturnType<typeof readSummary>>;
} | null = null;
const SUMMARY_TTL_MS = 15_000;
export async function summary(tx: Tx) {
  if (cached && Date.now() - cached.at < SUMMARY_TTL_MS) return cached.value;
  const value = await readSummary(tx);
  cached = { at: Date.now(), value };
  return value;
}
export function clearSummaryCache() {
  cached = null;
}
async function readSummary(tx: Tx) {
  const [stock] = await tx.$queryRaw<
    {
      active: bigint;
      active_retail: bigint | null;
      live: bigint;
      ending: bigint;
      drafts: bigint;
      oldest_draft: Date | null;
    }[]
  >`
    SELECT
      count(*) FILTER (WHERE status IN ('draft','scheduled','open','closing')) AS active,
      sum(retail_price_kobo) FILTER (WHERE status IN ('draft','scheduled','open','closing')) AS active_retail,
      count(*) FILTER (WHERE status IN ('open','closing')) AS live,
      count(*) FILTER (WHERE status IN ('open','closing') AND end_at <= now() + interval '24 hours') AS ending,
      count(*) FILTER (WHERE status = 'draft') AS drafts,
      min(created_at) FILTER (WHERE status = 'draft') AS oldest_draft
    FROM lots WHERE deleted_at IS NULL AND archived_at IS NULL`;
  const [ended] = await tx.$queryRaw<
    {
      waiting: bigint;
      waiting_retail: bigint | null;
      sold30: bigint;
      sold30_hammer: bigint | null;
      sold30_retail: bigint | null;
      ended30: bigint;
      unsold30: bigint;
    }[]
  >`
    SELECT
      count(*) FILTER (WHERE waiting) AS waiting,
      sum(l.retail_price_kobo) FILTER (WHERE waiting) AS waiting_retail,
      count(*) FILTER (WHERE sold AND recent) AS sold30,
      sum(s.hammer_kobo) FILTER (WHERE sold AND recent) AS sold30_hammer,
      sum(l.retail_price_kobo) FILTER (WHERE sold AND recent) AS sold30_retail,
      count(*) FILTER (WHERE recent) AS ended30,
      count(*) FILTER (WHERE s.status = 'unsold' AND recent) AS unsold30
    FROM lot_settlements s
    JOIN lots l ON l.id = s.lot_id
    LEFT JOIN unsold_relists r ON r.lot_id = s.lot_id
    CROSS JOIN LATERAL (SELECT
      s.status IN ('paid','frozen','payment_due') AS sold,
      s.closed_at >= now() - interval '30 days' AS recent,
      (s.status = 'unsold' AND s.relist_lot_id IS NULL AND r.lot_id IS NULL
        AND l.deleted_at IS NULL AND l.archived_at IS NULL) AS waiting) f`;
  const n = (v: bigint | null | undefined) => Number(v ?? 0);
  return {
    // In stock: everything not yet ended, plus unsold items waiting to relist.
    inStock: n(stock?.active) + n(ended?.waiting),
    inStockRetailKobo: n(stock?.active_retail) + n(ended?.waiting_retail),
    live: n(stock?.live),
    endingIn24h: n(stock?.ending),
    drafts: n(stock?.drafts),
    oldestDraftAt: stock?.oldest_draft?.toISOString() ?? null,
    sold30d: n(ended?.sold30),
    sold30dHammerKobo: n(ended?.sold30_hammer),
    sold30dRetailKobo: n(ended?.sold30_retail),
    unsoldToRelist: n(ended?.waiting),
    ended30d: n(ended?.ended30),
    unsold30d: n(ended?.unsold30),
  };
}

// One number per sort so the cursor is (key, id) for every sort order.
const sortKey = {
  // Live lots by end time, then scheduled by start, then everything else
  // newest first.
  ending: sql`CASE
    WHEN l.status IN ('open','closing') THEN EXTRACT(EPOCH FROM l.end_at)
    WHEN l.status = 'scheduled' THEN 100000000000 + EXTRACT(EPOCH FROM l.start_at)
    ELSE 300000000000 - EXTRACT(EPOCH FROM l.created_at) END`,
  newest: sql`-EXTRACT(EPOCH FROM l.created_at)`,
  price: sql`-COALESCE((SELECT max(bd.amount_kobo) FROM bids bd WHERE bd.lot_id = l.id), l.start_price_kobo)::float8`,
  bids: sql`-(SELECT count(*) FROM bids bd WHERE bd.lot_id = l.id)::float8`,
};

const cursorShape = z.object({ k: z.number(), id: z.uuid() }).strict();
export const lotCursor = {
  read(value: string | undefined) {
    if (!value) return null;
    try {
      return cursorShape.parse(
        JSON.parse(Buffer.from(value, 'base64url').toString()),
      );
    } catch {
      throw new BadRequestException('Reload the lots list and try again.');
    }
  },
  write(k: number, id: string) {
    return Buffer.from(JSON.stringify({ k, id })).toString('base64url');
  },
};

export async function pageIds(tx: Tx, f: LotListFilters) {
  const after = lotCursor.read(f.cursor);
  const key = sortKey[f.sort];
  const rows = await tx.$queryRaw<{ id: string; k: number }[]>`
    SELECT id, k FROM (
      SELECT l.id, (${key})::float8 AS k ${FROM}
      WHERE ${tabSql[f.tab]} ${filterSql(f)}
    ) page
    WHERE ${after ? sql`(k, id) > (${after.k}::float8, ${after.id}::uuid)` : sql`true`}
    ORDER BY k, id
    LIMIT ${f.limit + 1}`;
  const items = rows.slice(0, f.limit);
  const last = items.at(-1);
  return {
    ids: items.map((r) => r.id),
    nextCursor:
      rows.length > f.limit && last ? lotCursor.write(last.k, last.id) : null,
  };
}

export type LotRowData = {
  id: string;
  lot_number: string;
  title: string;
  thumbnail_url: string | null;
  category_name: string;
  category_icon: string;
  min_photos: number | null;
  condition: string;
  location_name: string;
  location_code: string;
  bin_code: string | null;
  stage: LotStage;
  status: string;
  archived_at: Date | null;
  deleted_at: Date | null;
  delete_reason: string | null;
  start_at: Date;
  end_at: Date;
  run_time_minutes: number | null;
  start_price_kobo: bigint;
  current_price_kobo: bigint | null;
  hammer_kobo: bigint | null;
  retail_price_kobo: bigint;
  bids: bigint;
  prebids: bigint;
  watching: bigint;
  photos: bigint;
  winner_name: string | null;
  created_by_id: string | null;
  created_by_name: string | null;
  created_at: Date;
  updated_at: Date;
};

/** The page's rows, with counts per lot from indexed lookups. */
export async function rowDetails(tx: Tx, ids: string[]) {
  if (!ids.length) return [];
  const rows = await tx.$queryRaw<LotRowData[]>`
    SELECT l.id::text, l.lot_number, l.title,
      (SELECT COALESCE(i.thumbnail_url, i.url) FROM lot_images i WHERE i.lot_id = l.id ORDER BY i.sort_order LIMIT 1) AS thumbnail_url,
      c.name AS category_name, c.icon AS category_icon,
      COALESCE(c.min_photos, pc.min_photos) AS min_photos,
      l.condition, loc.name AS location_name, loc.code AS location_code, b.code AS bin_code,
      ${STAGE_SQL} AS stage, l.status, l.archived_at, l.deleted_at, l.delete_reason,
      l.start_at, l.end_at, l.run_time_minutes,
      l.start_price_kobo,
      (SELECT max(bd.amount_kobo) FROM bids bd WHERE bd.lot_id = l.id) AS current_price_kobo,
      s.hammer_kobo, l.retail_price_kobo,
      (SELECT count(*) FROM bids bd WHERE bd.lot_id = l.id) AS bids,
      (SELECT count(*) FROM pre_bids pb WHERE pb.lot_id = l.id AND pb.status IN ('active','launching')) AS prebids,
      (SELECT count(*) FROM watchlist w WHERE w.lot_id = l.id) AS watching,
      (SELECT count(*) FROM lot_images i WHERE i.lot_id = l.id) AS photos,
      wu.name AS winner_name,
      l.created_by_id::text, cu.name AS created_by_name, l.created_at, l.updated_at
    FROM lots l
    JOIN categories c ON c.id = l.category_id
    LEFT JOIN categories pc ON pc.id = c.parent_id
    JOIN locations loc ON loc.id = l.location_id
    LEFT JOIN bins b ON b.id = l.bin_id
    LEFT JOIN lot_settlements s ON s.lot_id = l.id
    LEFT JOIN users wu ON wu.id = s.winner_id
    LEFT JOIN users cu ON cu.id = l.created_by_id
    WHERE l.id IN (${join(ids.map((id) => sql`${id}::uuid`))})`;
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row && (lotStages as readonly string[]).includes(row.stage)
      ? [row]
      : [];
  });
}
