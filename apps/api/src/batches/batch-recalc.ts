import {
  BATCH_STUCK_RELISTS,
  fromLedgerKobo,
  nextBatchStatus,
  recoveryCurve,
  shareBatchCost,
  type BatchStatus,
  type CostShareMethod,
} from '@auction-ng/shared';
import { Prisma } from '../generated/prisma/client';
import { encryptPii } from '../security/pii';

type Tx = Prisma.TransactionClient;
type Db = {
  $transaction: <T>(
    work: (tx: Tx) => Promise<T>,
    options?: { timeout?: number; maxWait?: number },
  ) => Promise<T>;
  $queryRaw: Tx['$queryRaw'];
  supplier: Tx['supplier'];
};
const sql = Prisma.sql;

/** Total cost of batch `b`. */
export const COST_SQL = sql`(b.cost_supplier_kobo + b.cost_transport_kobo + b.cost_customs_kobo + b.cost_other_kobo)`;
export const supplierPhonePurpose = 'supplier-phone';

/** Today's WAT calendar date, YYYY-MM-DD. */
export const watToday = (now = new Date()) =>
  new Date(now.getTime() + 3_600_000).toISOString().slice(0, 10);

/**
 * The batch's physical items: one row per item, however often it was
 * relisted. A relist is a new lot record, so earlier rounds are left out and
 * the newest record counts. Deleted lots don't count.
 */
const itemsSql = (batchId: string) => sql`
  WITH RECURSIVE links AS (
    SELECT s.lot_id AS old_id, s.relist_lot_id AS new_id
      FROM lot_settlements s JOIN lots l ON l.id = s.lot_id
      WHERE l.batch_id = ${batchId}::uuid AND s.relist_lot_id IS NOT NULL
    UNION
    SELECT r.lot_id, r.relist_lot_id
      FROM unsold_relists r JOIN lots l ON l.id = r.lot_id
      WHERE l.batch_id = ${batchId}::uuid
  ), chain AS (
    SELECT l.id, 0 AS relists, l.created_at AS first_at FROM lots l
      WHERE l.batch_id = ${batchId}::uuid
        AND NOT EXISTS (SELECT 1 FROM links k WHERE k.new_id = l.id)
    UNION ALL
    SELECT k.new_id, c.relists + 1, c.first_at
      FROM chain c JOIN links k ON k.old_id = c.id
  ), items AS (
    SELECT l.id, l.lot_number, l.title, l.category_id, l.retail_price_kobo,
      l.status, l.written_off_at, c.relists, c.first_at,
      s.status AS settlement_status,
      EXISTS (SELECT 1 FROM invoice_lines il JOIN invoices i ON i.id = il.invoice_id
        WHERE il.lot_id = l.id AND i.status = 'paid') AS sold
    FROM chain c
    JOIN lots l ON l.id = c.id
    LEFT JOIN lot_settlements s ON s.lot_id = l.id
    WHERE l.deleted_at IS NULL AND l.batch_id = ${batchId}::uuid
      AND NOT EXISTS (SELECT 1 FROM links k WHERE k.old_id = l.id)
  )`;
type ItemRow = {
  id: string;
  retail: bigint;
  status: string;
  written_off_at: Date | null;
  relists: number;
  first_at: Date;
  settlement_status: string | null;
  sold: boolean;
};
async function batchItems(tx: Tx, batchId: string) {
  return tx.$queryRaw<ItemRow[]>`
    ${itemsSql(batchId)}
    SELECT id::text, retail_price_kobo AS retail, status, written_off_at,
      relists, first_at, settlement_status, sold
    FROM items ORDER BY id`;
}
const isStuck = (i: ItemRow) =>
  !i.sold &&
  !i.written_off_at &&
  i.status === 'closed' &&
  i.settlement_status === 'unsold' &&
  Number(i.relists) >= BATCH_STUCK_RELISTS;

/** Items unsold after two relists and not relisted or written off. */
export async function stuckItems(tx: Tx, batchId: string, after?: string) {
  return tx.$queryRaw<
    { id: string; lotNumber: string; title: string; relists: number }[]
  >`
    ${itemsSql(batchId)}
    SELECT id::text, lot_number AS "lotNumber", title, relists::int FROM items
    WHERE NOT sold AND written_off_at IS NULL AND status = 'closed'
      AND settlement_status = 'unsold' AND relists >= ${BATCH_STUCK_RELISTS}
      AND (${after ?? null}::uuid IS NULL OR id > ${after ?? null}::uuid)
    ORDER BY id LIMIT 51`;
}

export async function unsoldByCategory(tx: Tx, batchId: string) {
  return tx.$queryRaw<{ name: string; items: bigint; cost: bigint | null }[]>`
    ${itemsSql(batchId)}
    SELECT COALESCE(p.name, c.name) AS name, count(*) AS items,
      sum(lc.unit_cost_kobo)::bigint AS cost
    FROM items i
    JOIN categories c ON c.id = i.category_id
    LEFT JOIN categories p ON p.id = c.parent_id
    LEFT JOIN lot_costs lc ON lc.lot_id = i.id
    WHERE NOT i.sold AND i.written_off_at IS NULL
    GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 50`;
}

/**
 * Paid, unrefunded hammer + premium per WAT day. The pickup record is created
 * the moment an invoice is paid, so its time is the payment time.
 */
export async function moneyBackByDay(tx: Tx, batchId: string) {
  const rows = await tx.$queryRaw<{ day: string; amount: bigint; at: Date }[]>`
    SELECT to_char(COALESCE(f.created_at, i.created_at) AT TIME ZONE 'Africa/Lagos', 'YYYY-MM-DD') AS day,
      sum(il.hammer_kobo + il.premium_kobo)::bigint AS amount,
      max(COALESCE(f.created_at, i.created_at)) AS at
    FROM lots l
    JOIN invoice_lines il ON il.lot_id = l.id
    JOIN invoices i ON i.id = il.invoice_id AND i.status = 'paid'
    LEFT JOIN fulfilments f ON f.invoice_id = i.id
    WHERE l.batch_id = ${batchId}::uuid
    GROUP BY 1 ORDER BY 1`;
  return rows.map((r) => ({
    day: r.day,
    amountKobo: fromLedgerKobo(r.amount),
    at: r.at,
  }));
}

/**
 * Recalculate one batch: each item's share of the cost, the stats, and the
 * automatic Selling/Closed steps. The batch row is locked without blocking
 * sales (NO KEY UPDATE), and no lot row is ever locked.
 */
export async function recalculateBatch(tx: Tx, batchId: string) {
  await tx.$queryRaw`SELECT id FROM batches WHERE id = ${batchId}::uuid FOR NO KEY UPDATE`;
  const batch = await tx.batch.findUnique({ where: { id: batchId } });
  if (!batch) return;
  const costKobo = fromLedgerKobo(
    batch.costSupplierKobo +
      batch.costTransportKobo +
      batch.costCustomsKobo +
      batch.costOtherKobo,
  );
  const items = await batchItems(tx, batchId);
  const sold = items.filter((i) => i.sold);
  const writtenOff = items.filter((i) => !i.sold && i.written_off_at);
  const unsold = items.filter((i) => !i.sold && !i.written_off_at);

  const ids = items.map((i) => i.id);
  if (batch.status !== 'closed') {
    const shares = shareBatchCost(
      costKobo,
      batch.costShareMethod as CostShareMethod,
      items.map((i) => ({
        id: i.id,
        retailPriceKobo: fromLedgerKobo(i.retail),
      })),
    );
    await tx.$executeRaw`DELETE FROM lot_costs WHERE batch_id = ${batchId}::uuid
      AND NOT (lot_id = ANY (${ids}::uuid[]))`;
    if (ids.length)
      await tx.$executeRaw`
        INSERT INTO lot_costs (lot_id, batch_id, unit_cost_kobo)
        SELECT s.lot_id, ${batchId}::uuid, s.cost
        FROM unnest(${ids}::uuid[], ${ids.map((id) => BigInt(shares.get(id) ?? 0))}::bigint[]) AS s(lot_id, cost)
        ON CONFLICT (lot_id) DO UPDATE SET batch_id = EXCLUDED.batch_id,
          unit_cost_kobo = EXCLUDED.unit_cost_kobo, updated_at = CURRENT_TIMESTAMP`;
  } else {
    // A closed batch keeps its costs; a relist carries its item's cost along.
    await tx.$executeRaw`
      INSERT INTO lot_costs (lot_id, batch_id, unit_cost_kobo)
      SELECT n.id, ${batchId}::uuid, c.unit_cost_kobo
      FROM lots n
      JOIN LATERAL (
        SELECT s.lot_id AS old_id FROM lot_settlements s WHERE s.relist_lot_id = n.id
        UNION ALL
        SELECT r.lot_id FROM unsold_relists r WHERE r.relist_lot_id = n.id
      ) k ON true
      JOIN lot_costs c ON c.lot_id = k.old_id
      WHERE n.batch_id = ${batchId}::uuid
      ON CONFLICT (lot_id) DO NOTHING`;
    await tx.$executeRaw`UPDATE lot_costs SET item_state = 'relisted'
      WHERE batch_id = ${batchId}::uuid AND NOT (lot_id = ANY (${ids}::uuid[]))`;
  }
  const state = (i: ItemRow) =>
    i.sold ? 'sold' : i.written_off_at ? 'written_off' : 'unsold';
  if (ids.length)
    await tx.$executeRaw`
      UPDATE lot_costs c SET item_state = s.state, item_since = s.since
      FROM unnest(${ids}::uuid[], ${items.map(state)}::text[], ${items.map((i) => i.first_at)}::timestamptz[]) AS s(lot_id, state, since)
      WHERE c.lot_id = s.lot_id AND c.batch_id = ${batchId}::uuid
        AND (c.item_state, c.item_since) IS DISTINCT FROM (s.state, s.since)`;
  const [unsoldCost] = await tx.$queryRaw<{ cost: bigint | null }[]>`
    SELECT sum(unit_cost_kobo)::bigint AS cost FROM lot_costs
    WHERE batch_id = ${batchId}::uuid AND item_state = 'unsold'`;
  // Received stock nobody has intaken yet is unsold stock at its full cost.
  const unsoldCostKobo =
    !items.length && ['received', 'selling'].includes(batch.status)
      ? BigInt(costKobo)
      : (unsoldCost?.cost ?? 0n);

  const days = await moneyBackByDay(tx, batchId);
  const moneyBack = days.reduce((sum, d) => sum + d.amountKobo, 0);
  const curve = batch.receivedOn
    ? recoveryCurve(
        batch.receivedOn.toISOString().slice(0, 10),
        watToday(),
        new Map(days.map((d) => [d.day, d.amountKobo])),
        costKobo,
      )
    : null;
  const stats = {
    lotsCount: items.length,
    lotsSold: sold.length,
    lotsWrittenOff: writtenOff.length,
    lotsStuck: items.filter(isStuck).length,
    moneyBackKobo: BigInt(moneyBack),
    unsoldCostKobo,
    oldestUnsoldAt: unsold.reduce<Date | null>(
      (min, i) => (!min || i.first_at < min ? i.first_at : min),
      null,
    ),
    lastSoldAt: days.at(-1)?.at ?? null,
    breakEvenOn: curve?.breakEvenOn
      ? new Date(curve.breakEvenOn + 'T00:00:00Z')
      : null,
    updatedAt: new Date(),
  };
  await tx.batchStats.upsert({
    where: { batchId },
    create: { batchId, ...stats },
    update: stats,
  });

  const next = nextBatchStatus({
    status: batch.status as BatchStatus,
    autoClose: batch.autoClose,
    itemsReceived: batch.itemsReceived,
    lots: items.length,
    published: items.some(
      (i) => i.relists > 0 || !['draft', 'cancelled'].includes(i.status),
    ),
    sold: sold.length,
    writtenOff: writtenOff.length,
  });
  if (next === batch.status) return;
  await tx.batch.update({
    where: { id: batchId },
    data: {
      status: next,
      // Publishing stock from an arriving batch means it has arrived.
      receivedOn: batch.receivedOn ?? new Date(watToday() + 'T00:00:00Z'),
      closedAt: next === 'closed' ? new Date() : null,
      closedReason:
        next === 'closed' ? 'Every item was sold or written off.' : null,
      updatedAt: new Date(Math.max(Date.now(), batch.updatedAt.getTime() + 1)),
    },
  });
  await tx.auditLog.create({
    data: {
      actorId: null,
      action: `batches.${next}`,
      entityType: 'batch',
      entityId: batchId,
      beforeCiphertext: encryptPii(
        JSON.stringify({ status: batch.status }),
        'audit',
      ),
      afterCiphertext: encryptPii(
        JSON.stringify({ status: next, automatic: true }),
        'audit',
      ),
    },
  });
}

export const queueBatch = (tx: Tx, batchId: string) =>
  tx.batchRecalc.create({ data: { batchId } });

/** The worker's job: every batch with something new, up to `limit`. */
export async function recalculateQueued(db: Db, limit = 50) {
  await encryptOldPhones(db);
  const waiting = await db.$queryRaw<{ batch_id: string }[]>`
    SELECT batch_id::text FROM batch_recalc_queue
    GROUP BY batch_id ORDER BY min(id) LIMIT ${limit}`;
  for (const { batch_id: id } of waiting)
    await db.$transaction(
      async (tx) => {
        // Only the requests seen here are removed: one that lands while this
        // runs stays queued for the next pass.
        const seen = await tx.batchRecalc.findMany({
          where: { batchId: id },
          select: { id: true },
          take: 10_000,
        });
        await recalculateBatch(tx, id);
        await tx.batchRecalc.deleteMany({
          where: { id: { in: seen.map((s) => s.id) } },
        });
      },
      { timeout: 60_000, maxWait: 15_000 },
    );
  return { batches: waiting.length };
}

/** Supplier phones saved before they were encrypted (AGENTS.md §9). */
async function encryptOldPhones(db: Db) {
  const rows = await db.supplier.findMany({
    where: { phone: { not: null } },
    select: { id: true, phone: true },
    take: 100,
  });
  for (const row of rows)
    if (row.phone)
      await db.supplier.updateMany({
        where: { id: row.id, phone: row.phone },
        data: {
          phone: null,
          phoneCiphertext: encryptPii(row.phone, supplierPhonePurpose),
        },
      });
}
