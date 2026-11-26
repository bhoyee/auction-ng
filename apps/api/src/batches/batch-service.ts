import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  BATCH_EXPORT_MAX_ROWS,
  BATCH_FILE_MAX_BYTES,
  BATCH_MAX_FILES,
  BATCH_PAGE_SIZE,
  BATCH_RESTORE_DAYS,
  batchPurgeAt,
  batchDeleteSchema,
  batchActivitySchema,
  batchDetailSchema,
  batchFilesSchema,
  batchFileUploadSchema,
  batchFormSchema,
  batchListQuerySchema,
  batchMarginKobo,
  batchPageSchema,
  batchPickerQuerySchema,
  batchPickerSchema,
  batchReasonSchema,
  batchReceiveSchema,
  batchRowSchema,
  batchSaveSchema,
  batchStatusLabels,
  batchStuckPageSchema,
  batchWriteOffResultSchema,
  batchWriteOffSchema,
  fromLedgerKobo,
  lotStage,
  percentOf,
  recoveryCurve,
  recoveryPercent,
  sniffBatchFile,
  type BatchListFilters,
  type BatchRow,
  type BatchStatus,
  type StaffPermission,
} from '@auction-ng/shared';
import { Prisma } from '../generated/prisma/client';
import type { AuthIdentity } from '../auth/auth-service';
import { staffAccess } from '../auth/staff-access';
import {
  assertFresh,
  blocked,
  fieldError,
  LotSetupBase,
  nextUpdatedAt,
  parseInput,
  type Tx,
} from '../lot-setup/lot-setup-base';
import { decryptPii, encryptPii } from '../security/pii';
import {
  COST_SQL,
  moneyBackByDay,
  lockRecalculation,
  queueBatch,
  recalculateBatch,
  recalculateQueued,
  stuckItems,
  unsoldByCategory,
  watToday,
} from './batch-recalc';
import { purgeDeletedBatches } from './batch-deletion';

const sql = Prisma.sql;
const join = Prisma.join;
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const fromDay = (d: string) => new Date(d + 'T00:00:00Z');
const filePurpose = 'batch-attachment';

const activityLabels: Record<string, string> = {
  'batches.created': 'Batch added',
  'batches.updated': 'Batch edited',
  'batches.received': 'Marked received',
  'batches.selling': 'First lot published: now selling',
  'batches.closed': 'Closed',
  'batches.reopened': 'Reopened',
  'batches.lots_written_off': 'Items written off',
  'batches.file_added': 'File attached',
  'batches.file_removed': 'File removed',
  'batches.deleted': 'Moved to Deleted',
  'batches.restored': 'Restored',
  'batches.purged': 'Automatically removed after 30 days',
};

const cursorSchema = z.object({ at: z.iso.datetime(), id: z.uuid() }).strict();
const cursor = {
  read(value?: string) {
    if (!value) return null;
    try {
      const c = cursorSchema.parse(
        JSON.parse(Buffer.from(value, 'base64url').toString()),
      );
      return { at: new Date(c.at), id: c.id };
    } catch {
      throw new BadRequestException('Reload the list and try again.');
    }
  },
  write(at: Date, id: string) {
    return Buffer.from(JSON.stringify({ at: at.toISOString(), id })).toString(
      'base64url',
    );
  },
};

type Row = {
  id: string;
  code: string;
  name: string;
  supplier_id: string;
  supplier_name: string;
  location_name: string;
  location_code: string;
  status: BatchStatus;
  bought_on: Date;
  expected_on: Date | null;
  received_on: Date | null;
  items_expected: number;
  items_received: number | null;
  lots: number | null;
  sold: number | null;
  written_off: number | null;
  cost: bigint;
  money_back: bigint | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};
const ROW_FROM = sql`FROM batches b
  JOIN suppliers sp ON sp.id = b.supplier_id
  JOIN locations loc ON loc.id = b.location_id
  LEFT JOIN batch_stats st ON st.batch_id = b.id`;
const ROW_COLUMNS = sql`b.id::text, b.code, b.name, sp.id::text AS supplier_id, sp.name AS supplier_name,
  loc.name AS location_name, loc.code AS location_code, b.status,
  b.bought_on, b.expected_on, b.received_on, b.items_expected, b.items_received,
  st.lots_count AS lots, st.lots_sold AS sold, st.lots_written_off AS written_off,
  ${COST_SQL} AS cost, st.money_back_kobo AS money_back, b.created_at, b.updated_at, b.deleted_at`;

const tabSql = {
  open: sql`b.deleted_at IS NULL AND b.status <> 'closed'`,
  arriving: sql`b.deleted_at IS NULL AND b.status = 'arriving'`,
  closed: sql`b.deleted_at IS NULL AND b.status = 'closed'`,
  all: sql`b.deleted_at IS NULL`,
  deleted: sql`b.deleted_at IS NOT NULL`,
};

function dto(r: Row, costs: boolean): BatchRow {
  const lots = r.lots ?? 0;
  const sold = r.sold ?? 0;
  const items = Math.max(r.items_received ?? r.items_expected, 1);
  const cost = fromLedgerKobo(r.cost);
  const back = fromLedgerKobo(r.money_back ?? 0n);
  return batchRowSchema.parse({
    id: r.id,
    code: r.code,
    name: r.name,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    locationName: r.location_name,
    locationCode: r.location_code,
    status: r.status,
    boughtOn: dateOnly(r.bought_on),
    expectedOn: r.expected_on ? dateOnly(r.expected_on) : null,
    receivedOn: r.received_on ? dateOnly(r.received_on) : null,
    itemsExpected: r.items_expected,
    itemsReceived: r.items_received,
    lots,
    sold,
    writtenOff: r.written_off ?? 0,
    intakenPercent: Math.min(100, percentOf(lots, items) ?? 0),
    soldPercent: Math.min(100, percentOf(sold, Math.max(items, lots)) ?? 0),
    costKobo: costs ? cost : null,
    moneyBackKobo: costs ? back : null,
    marginKobo: costs ? batchMarginKobo(back, cost) : null,
    recoveryPercent: costs ? recoveryPercent(back, cost) : null,
    updatedAt: r.updated_at.toISOString(),
    deletedAt: r.deleted_at?.toISOString() ?? null,
  });
}

/** A supplier's batches for Lot setup › Suppliers, newest first. */
export async function supplierBatches(
  tx: Tx,
  supplierId: string,
  after: string | undefined,
  costs: boolean,
) {
  const at = cursor.read(after);
  const rows = await tx.$queryRaw<Row[]>`
    SELECT ${ROW_COLUMNS} ${ROW_FROM}
    WHERE b.supplier_id = ${supplierId}::uuid AND b.deleted_at IS NULL
      AND ${at ? sql`(b.created_at, b.id) < (${at.at}, ${at.id}::uuid)` : sql`true`}
    ORDER BY b.created_at DESC, b.id DESC LIMIT 11`;
  const page = rows.slice(0, 10);
  const last = page.at(-1);
  return {
    items: page.map((r) => dto(r, costs)),
    nextCursor:
      rows.length > 10 && last ? cursor.write(last.created_at, last.id) : null,
  };
}

/** Totals per supplier: batches, spend, and "got back" from selling stock. */
export async function supplierTotals(tx: Tx, ids: string[]) {
  if (!ids.length) return new Map<string, SupplierTotals>();
  const rows = await tx.$queryRaw<
    {
      id: string;
      batches: bigint;
      spent: bigint;
      started_cost: bigint | null;
      started_back: bigint | null;
    }[]
  >`
    SELECT b.supplier_id::text AS id, count(*) AS batches,
      sum(${COST_SQL})::bigint AS spent,
      sum(${COST_SQL}) FILTER (WHERE b.status IN ('selling','closed'))::bigint AS started_cost,
      sum(st.money_back_kobo) FILTER (WHERE b.status IN ('selling','closed'))::bigint AS started_back
    FROM batches b LEFT JOIN batch_stats st ON st.batch_id = b.id
    WHERE b.deleted_at IS NULL AND b.supplier_id IN (${join(ids.map((id) => sql`${id}::uuid`))})
    GROUP BY b.supplier_id`;
  return new Map(
    rows.map((r) => [
      r.id,
      {
        batches: Number(r.batches),
        spentKobo: fromLedgerKobo(r.spent),
        // Stock that has not started selling can't have earned anything yet.
        gotBackPercent: recoveryPercent(
          fromLedgerKobo(r.started_back ?? 0n),
          fromLedgerKobo(r.started_cost ?? 0n),
        ),
      },
    ]),
  );
}
export type SupplierTotals = {
  batches: number;
  spentKobo: number;
  gotBackPercent: number | null;
};

// Inventory batches (T15e). Permissions are checked here, not only in the UI;
// money fields are null unless the role has batches.costs.
export class BatchService extends LotSetupBase {
  private async access(
    tx: Tx,
    who: AuthIdentity,
    permission: StaffPermission = 'batches.read',
  ) {
    await this.staff.actor(tx, who, permission);
    const { permissions } = await staffAccess(tx, who.user.id);
    const can = (p: StaffPermission) => permissions.includes(p);
    return {
      can,
      costs: can('batches.costs'),
      flags: {
        canManage: can('batches.manage') && can('batches.costs'),
        canReceive: can('batches.receive') || can('batches.manage'),
        canSeeCosts: can('batches.costs'),
      },
    };
  }

  private where(f: BatchListFilters) {
    const parts: Prisma.Sql[] = [];
    if (f.search) {
      const like = `%${f.search.replace(/[\\%_]/g, '\\$&')}%`;
      parts.push(
        sql`(b.code ILIKE ${like} OR b.name ILIKE ${like} OR sp.name ILIKE ${like})`,
      );
    }
    if (f.supplierIds?.length)
      parts.push(
        sql`b.supplier_id IN (${join(f.supplierIds.map((id) => sql`${id}::uuid`))})`,
      );
    if (f.locationIds?.length)
      parts.push(
        sql`b.location_id IN (${join(f.locationIds.map((id) => sql`${id}::uuid`))})`,
      );
    if (f.status) parts.push(sql`b.status = ${f.status}`);
    if (f.receivedFrom)
      parts.push(sql`b.received_on >= ${f.receivedFrom}::date`);
    if (f.receivedTo) parts.push(sql`b.received_on <= ${f.receivedTo}::date`);
    return parts.length ? sql`AND ${join(parts, ' AND ')}` : Prisma.empty;
  }

  private async rows(tx: Tx, f: BatchListFilters, limit: number) {
    const after = cursor.read(f.cursor);
    const rows = await tx.$queryRaw<Row[]>`
      SELECT ${ROW_COLUMNS} ${ROW_FROM}
      WHERE ${tabSql[f.tab]} ${this.where(f)}
        AND ${after ? sql`(b.created_at, b.id) < (${after.at}, ${after.id}::uuid)` : sql`true`}
      ORDER BY b.created_at DESC, b.id DESC LIMIT ${limit + 1}`;
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      page,
      nextCursor:
        rows.length > limit && last
          ? cursor.write(last.created_at, last.id)
          : null,
    };
  }

  async list(who: AuthIdentity, input: unknown) {
    const f = parseInput(batchListQuerySchema, input);
    return this.db.$transaction(async (tx) => {
      const { costs, flags } = await this.access(tx, who);
      if (f.tab === 'deleted' && !flags.canManage)
        throw new ForbiddenException();
      const { page, nextCursor } = await this.rows(tx, f, f.limit);
      const [counts] = await tx.$queryRaw<
        Record<'open' | 'arriving' | 'closed' | 'all' | 'deleted', bigint>[]
      >`
        SELECT count(*) FILTER (WHERE ${tabSql.open}) AS open,
          count(*) FILTER (WHERE ${tabSql.arriving}) AS arriving,
          count(*) FILTER (WHERE ${tabSql.closed}) AS closed,
          count(*) FILTER (WHERE ${tabSql.all}) AS "all",
          count(*) FILTER (WHERE ${tabSql.deleted}) AS deleted
        ${ROW_FROM} WHERE true ${this.where(f)}`;
      const today = watToday();
      const [cards] = await tx.$queryRaw<
        {
          unsold_cost: bigint | null;
          unsold_lots: bigint | null;
          locations: bigint;
          open: bigint;
          arriving: bigint;
          closed_cost: bigint | null;
          closed_back: bigint | null;
        }[]
      >`
        SELECT sum(st.unsold_cost_kobo)::bigint AS unsold_cost,
          sum(st.lots_count - st.lots_sold - st.lots_written_off)::bigint AS unsold_lots,
          count(DISTINCT b.location_id) FILTER (WHERE st.lots_count > st.lots_sold + st.lots_written_off) AS locations,
          count(*) FILTER (WHERE b.status <> 'closed') AS open,
          count(*) FILTER (WHERE b.status = 'arriving'
            AND b.expected_on BETWEEN date_trunc('week', ${today}::date)::date
            AND date_trunc('week', ${today}::date)::date + 6) AS arriving,
          sum(${COST_SQL}) FILTER (WHERE b.status = 'closed')::bigint AS closed_cost,
          sum(st.money_back_kobo) FILTER (WHERE b.status = 'closed')::bigint AS closed_back
        FROM batches b LEFT JOIN batch_stats st ON st.batch_id = b.id WHERE b.deleted_at IS NULL`;
      const [oldest] = await tx.$queryRaw<
        { at: Date; code: string; location: string }[]
      >`
        SELECT st.oldest_unsold_at AS at, b.code, loc.name AS location
        FROM batch_stats st JOIN batches b ON b.id = st.batch_id
        JOIN locations loc ON loc.id = b.location_id
        WHERE st.oldest_unsold_at IS NOT NULL AND b.deleted_at IS NULL
        ORDER BY st.oldest_unsold_at LIMIT 1`;
      return batchPageSchema.parse({
        items: page.map((r) => dto(r, costs)),
        counts: {
          open: Number(counts?.open ?? 0),
          arriving: Number(counts?.arriving ?? 0),
          closed: Number(counts?.closed ?? 0),
          all: Number(counts?.all ?? 0),
          deleted: flags.canManage ? Number(counts?.deleted ?? 0) : 0,
        },
        cards: {
          unsoldCostKobo: costs
            ? fromLedgerKobo(cards?.unsold_cost ?? 0n)
            : null,
          unsoldLots: Number(cards?.unsold_lots ?? 0),
          unsoldLocations: Number(cards?.locations ?? 0),
          openBatches: Number(cards?.open ?? 0),
          arrivingThisWeek: Number(cards?.arriving ?? 0),
          averageRecoveryPercent: costs
            ? recoveryPercent(
                fromLedgerKobo(cards?.closed_back ?? 0n),
                fromLedgerKobo(cards?.closed_cost ?? 0n),
              )
            : null,
          oldestUnsold: oldest
            ? {
                days: Math.max(
                  0,
                  Math.floor((Date.now() - oldest.at.getTime()) / 86_400_000),
                ),
                batchCode: oldest.code,
                locationName: oldest.location,
              }
            : null,
        },
        nextCursor,
        ...flags,
      });
    });
  }

  async exportCsv(who: AuthIdentity, input: unknown) {
    const f = parseInput(batchListQuerySchema, input);
    return this.db.$transaction(
      async (tx) => {
        if (f.tab === 'deleted')
          throw new ForbiddenException('Deleted batches are not exported.');
        const { costs } = await this.access(tx, who);
        const { page, nextCursor } = await this.rows(
          tx,
          { ...f, cursor: undefined },
          BATCH_EXPORT_MAX_ROWS,
        );
        if (nextCursor)
          throw new BadRequestException(
            `Narrow the filters to ${BATCH_EXPORT_MAX_ROWS.toLocaleString('en-NG')} batches or fewer to export.`,
          );
        const naira = (v: number | null) =>
          v === null ? '' : (v / 100).toFixed(2);
        const cell = (v: string) => {
          const safe = /^[=+@\t\r]|^-(?!\d)/.test(v) ? `'${v}` : v;
          return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
        };
        const lines = page.map((raw) => {
          const r = dto(raw, costs);
          return [
            r.code,
            r.name,
            r.supplierName,
            r.locationName,
            batchStatusLabels[r.status],
            r.boughtOn,
            r.expectedOn ?? '',
            r.receivedOn ?? '',
            String(r.itemsReceived ?? r.itemsExpected),
            String(r.lots),
            String(r.sold),
            String(r.writtenOff),
            ...(costs
              ? [
                  naira(r.costKobo),
                  naira(r.moneyBackKobo),
                  naira(r.marginKobo),
                  String(r.recoveryPercent ?? ''),
                ]
              : []),
          ]
            .map(cell)
            .join(',');
        });
        await this.auditRow(tx, who.user.id, 'exported', who.user.id, null, {
          rows: lines.length,
        });
        const header =
          'Batch,Name,Supplier,Pickup location,Status,Bought,Expected,Received,Items,Lots,Sold,Written off' +
          (costs ? ',Cost (NGN),Money back (NGN),Margin (NGN),Recovery %' : '');
        return {
          filename: `batches-${watToday()}.csv`,
          csv: `${String.fromCharCode(0xfeff)}${header}\n${lines.join('\n')}\n`,
          rows: lines.length,
        };
      },
      { timeout: 30_000 },
    );
  }

  private async one(tx: Tx, id: string, deleted = false) {
    const [row] = await tx.$queryRaw<Row[]>`
      SELECT ${ROW_COLUMNS} ${ROW_FROM} WHERE b.id = ${id}::uuid AND (${deleted} OR b.deleted_at IS NULL)`;
    if (!row) throw new NotFoundException('Batch not found.');
    return row;
  }

  async detail(who: AuthIdentity, id: string) {
    return this.db.$transaction(async (tx) => {
      const { costs, flags } = await this.access(tx, who);
      const row = await this.one(tx, id, flags.canManage);
      const full = await tx.batch.findUniqueOrThrow({
        where: { id },
        include: {
          categories: { include: { category: true } },
          stats: true,
        },
      });
      const left = await unsoldByCategory(tx, id);
      const cost = fromLedgerKobo(row.cost);
      let recovery = null;
      if (costs && full.receivedOn) {
        const days = await moneyBackByDay(tx, id);
        // A closed batch's chart stops at its last sale or closing day.
        const end =
          full.closedAt === null
            ? watToday()
            : ([
                watToday(full.closedAt),
                days.at(-1)?.day ?? watToday(full.closedAt),
              ]
                .sort()
                .at(-1) ?? watToday());
        recovery = recoveryCurve(
          dateOnly(full.receivedOn),
          end,
          new Map(days.map((d) => [d.day, d.amountKobo])),
          cost,
        );
      }
      return batchDetailSchema.parse({
        canDelete:
          flags.canManage &&
          !full.deletedAt &&
          full.status === 'arriving' &&
          !full.receivedOn &&
          full.itemsReceived === null &&
          !full.stockLinkedAt,
        canRestore:
          flags.canManage &&
          !!full.deletedAt &&
          Date.parse(batchPurgeAt(full.deletedAt.toISOString())) > Date.now(),
        deleteReason: full.deleteReason,
        purgeAt: full.deletedAt
          ? batchPurgeAt(full.deletedAt.toISOString())
          : null,
        batch: dto(row, costs),
        supplierRef: costs ? full.supplierRef : null,
        locationId: full.locationId,
        categories: full.categories.map((c) => ({
          id: c.categoryId,
          name: c.category.name,
        })),
        costs: costs
          ? {
              costSupplierKobo: fromLedgerKobo(full.costSupplierKobo),
              costTransportKobo: fromLedgerKobo(full.costTransportKobo),
              costCustomsKobo: fromLedgerKobo(full.costCustomsKobo),
              costOtherKobo: fromLedgerKobo(full.costOtherKobo),
              costShareMethod: full.costShareMethod,
              paidFrom: full.paidFrom,
            }
          : null,
        notes: full.notes,
        closedAt: full.closedAt?.toISOString() ?? null,
        closedReason: full.closedReason,
        recovery,
        left: {
          unsold: left.reduce((s, c) => s + Number(c.items), 0),
          categories: left.map((c) => ({
            name: c.name,
            items: Number(c.items),
            costKobo: costs ? fromLedgerKobo(c.cost ?? 0n) : null,
          })),
          stuck: full.stats?.lotsStuck ?? 0,
        },
        costsAreEstimates:
          full.status !== 'closed' &&
          (full.stats?.lotsCount ?? 0) <
            (full.itemsReceived ?? full.itemsExpected),
        ...flags,
      });
    });
  }

  async stuck(who: AuthIdentity, id: string, input: unknown) {
    const { cursor: after } = parseInput(
      z.object({ cursor: z.uuid().optional() }).strict(),
      input,
    );
    return this.db.$transaction(async (tx) => {
      const { flags } = await this.access(tx, who);
      await this.one(tx, id, flags.canManage);
      const rows = await stuckItems(tx, id, after);
      return batchStuckPageSchema.parse({
        items: rows.slice(0, 50),
        nextCursor: rows.length > 50 ? (rows[49]?.id ?? null) : null,
      });
    });
  }

  async activity(who: AuthIdentity, id: string, input: unknown) {
    const { cursor: value } = parseInput(
      z.object({ cursor: z.string().max(400).optional() }).strict(),
      input,
    );
    const after = cursor.read(value);
    return this.db.$transaction(async (tx) => {
      const { flags } = await this.access(tx, who);
      await this.one(tx, id, flags.canManage);
      const rows = await tx.auditLog.findMany({
        where: {
          entityType: 'batch',
          entityId: id,
          ...(after
            ? {
                OR: [
                  { createdAt: { lt: after.at } },
                  { createdAt: after.at, id: { lt: after.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
        include: { actor: { select: { name: true } } },
      });
      const page = rows.slice(0, 20);
      const last = page.at(-1);
      return batchActivitySchema.parse({
        items: page.map((r) => ({
          id: r.id,
          at: r.createdAt.toISOString(),
          actor: r.actor?.name ?? 'GiddyDeal',
          label: activityLabels[r.action] ?? 'Changed',
        })),
        nextCursor:
          rows.length > 20 && last
            ? cursor.write(last.createdAt, last.id)
            : null,
      });
    });
  }

  async form(who: AuthIdentity) {
    return this.db.$transaction(async (tx) => {
      const { can } = await this.access(tx, who, 'batches.manage');
      const suppliers = await tx.supplier.findMany({
        where: { deletedAt: null, active: true },
        orderBy: { name: 'asc' },
        take: 500,
        select: { id: true, name: true },
      });
      const locations = await tx.location.findMany({
        where: { archivedAt: null },
        orderBy: { name: 'asc' },
        take: 50,
        select: { id: true, name: true, code: true },
      });
      const categories = await tx.category.findMany({
        where: { archivedAt: null, parentId: null },
        orderBy: { sortOrder: 'asc' },
        take: 200,
        select: { id: true, name: true },
      });
      const [seq] = await tx.$queryRaw<{ last: bigint; called: boolean }[]>`
        SELECT last_value AS last, is_called AS called FROM batch_code_seq`;
      const n = Number(seq?.last ?? 1n) + (seq?.called ? 1 : 0);
      return batchFormSchema.parse({
        suppliers,
        locations,
        categories,
        nextCode: 'B-' + String(n).padStart(4, '0'),
        canAddSupplier: can('setup.manage'),
      });
    });
  }

  /** Open batches for the lot form; never any cost. */
  async picker(who: AuthIdentity, input: unknown) {
    const q = parseInput(batchPickerQuerySchema, input);
    const after = cursor.read(q.cursor);
    return this.db.$transaction(async (tx) => {
      const { can } = await this.access(tx, who);
      const rows = await tx.batch.findMany({
        where: {
          deletedAt: null,
          ...(q.id ? { id: q.id } : { status: { not: 'closed' } }),
          ...(q.locationId ? { locationId: q.locationId } : {}),
          ...(q.search
            ? {
                OR: [
                  { code: { contains: q.search, mode: 'insensitive' } },
                  { name: { contains: q.search, mode: 'insensitive' } },
                ],
              }
            : {}),
          ...(after
            ? {
                AND: {
                  OR: [
                    { createdAt: { lt: after.at } },
                    { createdAt: after.at, id: { lt: after.id } },
                  ],
                },
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: BATCH_PAGE_SIZE + 1,
        include: {
          supplier: { select: { name: true } },
          stats: { select: { lotsCount: true } },
        },
      });
      const page = rows.slice(0, BATCH_PAGE_SIZE);
      const last = page.at(-1);
      // The batch this person last added a lot to.
      const [used] = await tx.$queryRaw<{ batch_id: string }[]>`
        SELECT l.batch_id::text FROM lots l JOIN batches b ON b.id = l.batch_id
        WHERE l.created_by_id = ${who.user.id}::uuid AND b.status <> 'closed' AND b.deleted_at IS NULL
          AND (${q.locationId ?? null}::uuid IS NULL OR b.location_id = ${q.locationId ?? null}::uuid)
        ORDER BY l.created_at DESC LIMIT 1`;
      return batchPickerSchema.parse({
        items: page.map((b) => ({
          id: b.id,
          code: b.code,
          name: b.name,
          supplierName: b.supplier.name,
          locationId: b.locationId,
          status: b.status,
          itemsExpected: b.itemsReceived ?? b.itemsExpected,
          lots: b.stats?.lotsCount ?? 0,
        })),
        nextCursor:
          rows.length > BATCH_PAGE_SIZE && last
            ? cursor.write(last.createdAt, last.id)
            : null,
        lastUsedId: used?.batch_id ?? null,
        canAdd: can('batches.manage') && can('batches.costs'),
      });
    });
  }

  // ------------------------------------------------------------ changes ----

  private async auditRow(
    tx: Tx,
    actorId: string,
    action: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ) {
    const json = (v: unknown) =>
      encryptPii(
        JSON.stringify(v, (_, x: unknown) =>
          typeof x === 'bigint' ? x.toString() : x,
        ),
        'audit',
      );
    await tx.auditLog.create({
      data: {
        actorId,
        action: `batches.${action}`,
        entityType: 'batch',
        entityId,
        beforeCiphertext: before ? json(before) : null,
        afterCiphertext: json(after),
      },
    });
  }

  private async locked(tx: Tx, id: string, deleted = false) {
    await tx.$queryRaw`SELECT id FROM batches WHERE id = ${id}::uuid FOR NO KEY UPDATE`;
    const batch = await tx.batch.findUnique({
      where: { id },
      include: { categories: true },
    });
    if (!batch) throw new NotFoundException('Batch not found.');
    if (batch.deletedAt && !deleted)
      throw blocked('This batch is deleted. Restore it before making changes.');
    return batch;
  }

  private changed<T extends { idempotencyKey: string }>(
    who: AuthIdentity,
    input: T,
    action: string,
    permission: StaffPermission,
    work: Parameters<BatchService['change']>[4],
  ) {
    return this.change(who, input, 'batch', action, work, {
      permission,
      auditAction: `batches.${action}`,
    });
  }

  async save(who: AuthIdentity, input: unknown) {
    const v = parseInput(batchSaveSchema, input);
    return this.changed(
      who,
      v,
      v.id ? 'updated' : 'created',
      'batches.manage',
      async (tx) => {
        const { costs } = await this.access(tx, who, 'batches.manage');
        if (!costs)
          throw new ForbiddenException(
            'Adding batches needs permission to see batch costs.',
          );
        const before = v.id ? await this.locked(tx, v.id) : null;
        if (before) {
          if (!v.expectedUpdatedAt)
            throw blocked('Reload this batch before saving.');
          assertFresh(before.updatedAt, v.expectedUpdatedAt, 'batch');
          if (before.status === 'closed')
            throw blocked('This batch is closed. Reopen it to edit it.');
          const lots = await tx.lot.count({
            where: { batchId: before.id, deletedAt: null },
          });
          if (lots && v.supplierId !== before.supplierId)
            throw fieldError(
              'supplierId',
              'Lots already came from this batch, so its supplier can’t change.',
            );
          if (lots && v.locationId !== before.locationId)
            throw fieldError(
              'locationId',
              'Lots already came from this batch, so its location can’t change.',
            );
          if (before.status !== 'arriving' && v.status === 'arriving')
            throw fieldError('status', 'This batch has already arrived.');
          if (before.status === 'arriving' && v.status === 'received')
            throw fieldError(
              'status',
              'Use Mark received so the real item count is recorded.',
            );
        }
        if (v.supplierId !== before?.supplierId) {
          await tx.$queryRaw`SELECT id FROM suppliers WHERE id = ${v.supplierId}::uuid FOR SHARE`;
          const supplier = await tx.supplier.findUnique({
            where: { id: v.supplierId },
          });
          if (!supplier || supplier.deletedAt)
            throw fieldError('supplierId', 'Pick a supplier.', 400);
          if (!supplier.active)
            throw fieldError(
              'supplierId',
              'This supplier is paused. Make it active to buy from it again.',
            );
        }
        if (
          v.locationId !== before?.locationId &&
          !(await tx.location.findFirst({
            where: { id: v.locationId, archivedAt: null },
          }))
        )
          throw fieldError('locationId', 'Pick a pickup location.', 400);
        if (v.boughtOn > watToday())
          throw fieldError(
            'boughtOn',
            'The buying date can’t be in the future.',
            400,
          );
        const categoryIds = [...new Set(v.categoryIds)];
        if (
          categoryIds.length &&
          (await tx.category.count({
            where: { id: { in: categoryIds }, archivedAt: null },
          })) !== categoryIds.length
        )
          throw fieldError(
            'categoryIds',
            'Pick categories from the list.',
            400,
          );
        const data = {
          name: v.name,
          supplierId: v.supplierId,
          supplierRef: v.supplierRef,
          boughtOn: fromDay(v.boughtOn),
          locationId: v.locationId,
          expectedOn: v.expectedOn ? fromDay(v.expectedOn) : null,
          itemsExpected: v.itemsExpected,
          costSupplierKobo: BigInt(v.costSupplierKobo),
          costTransportKobo: BigInt(v.costTransportKobo),
          costCustomsKobo: BigInt(v.costCustomsKobo),
          costOtherKobo: BigInt(v.costOtherKobo),
          costShareMethod: v.costShareMethod,
          paidFrom: v.paidFrom,
          notes: v.notes,
          updatedAt: nextUpdatedAt(before?.updatedAt),
        };
        const after = before
          ? await tx.batch.update({ where: { id: before.id }, data })
          : await tx.batch.create({
              data: {
                ...data,
                status: v.status,
                receivedOn:
                  v.status === 'received' ? fromDay(watToday()) : null,
                createdById: who.user.id,
              },
            });
        await tx.batchCategory.deleteMany({ where: { batchId: after.id } });
        await tx.batchCategory.createMany({
          data: categoryIds.map((categoryId) => ({
            batchId: after.id,
            categoryId,
          })),
        });
        await queueBatch(tx, after.id);
        return {
          result: { id: after.id, message: `${after.code} saved.` },
          before,
          after: { ...after, categoryIds },
        };
      },
    );
  }

  async receive(who: AuthIdentity, input: unknown) {
    const v = parseInput(batchReceiveSchema, input);
    return this.changed(who, v, 'received', 'batches.read', async (tx) => {
      const { flags } = await this.access(tx, who);
      if (!flags.canReceive)
        throw new ForbiddenException('Your role can’t mark batches received.');
      const before = await this.locked(tx, v.id);
      assertFresh(before.updatedAt, v.expectedUpdatedAt, 'batch');
      if (before.status === 'closed')
        throw blocked('This batch is closed. Reopen it first.');
      const after = await tx.batch.update({
        where: { id: v.id },
        data: {
          status: before.status === 'arriving' ? 'received' : before.status,
          receivedOn: before.receivedOn ?? fromDay(watToday()),
          itemsReceived: v.itemsReceived,
          updatedAt: nextUpdatedAt(before.updatedAt),
        },
      });
      await queueBatch(tx, v.id);
      return {
        result: {
          id: v.id,
          message: `${after.code} received: ${v.itemsReceived.toLocaleString('en-NG')} ${v.itemsReceived === 1 ? 'item' : 'items'}.`,
        },
        before,
        after,
      };
    });
  }

  async close(who: AuthIdentity, input: unknown) {
    const v = parseInput(batchReasonSchema, input);
    return this.changed(who, v, 'closed', 'batches.manage', async (tx) => {
      await lockRecalculation(tx);
      const before = await this.locked(tx, v.id);
      assertFresh(before.updatedAt, v.expectedUpdatedAt, 'batch');
      if (before.status === 'closed') throw blocked('Already closed.');
      if (before.status === 'arriving')
        throw blocked('Mark this batch received before closing it.');
      // Unit costs freeze on closing, so share the final cost first.
      await recalculateBatch(tx, v.id);
      const after = await tx.batch.update({
        where: { id: v.id },
        data: {
          status: 'closed',
          closedAt: new Date(),
          closedReason: v.reason,
          updatedAt: nextUpdatedAt(before.updatedAt),
        },
      });
      await queueBatch(tx, v.id);
      return {
        result: { id: v.id, message: `${after.code} closed.` },
        before,
        after,
      };
    });
  }

  async reopen(who: AuthIdentity, input: unknown) {
    const v = parseInput(batchReasonSchema, input);
    return this.changed(who, v, 'reopened', 'batches.manage', async (tx) => {
      const before = await this.locked(tx, v.id);
      assertFresh(before.updatedAt, v.expectedUpdatedAt, 'batch');
      if (before.status !== 'closed') throw blocked('This batch is open.');
      const after = await tx.batch.update({
        where: { id: v.id },
        data: {
          // The recalculation moves it on to Selling when a lot is published.
          status: 'received',
          closedAt: null,
          closedReason: null,
          autoClose: false,
          updatedAt: nextUpdatedAt(before.updatedAt),
        },
      });
      await queueBatch(tx, v.id);
      return {
        result: { id: v.id, message: `${after.code} reopened.` },
        before,
        after: { ...after, reason: v.reason },
      };
    });
  }

  /** Written-off items keep their cost but leave the Lots list. */
  async writeOff(who: AuthIdentity, id: string, input: unknown) {
    const v = parseInput(batchWriteOffSchema, input);
    let done = 0;
    const skipped: { id: string; lotNumber: string; reason: string }[] = [];
    // Each lot in its own transaction, locked the way relists and deletes
    // lock it, so an item can't be relisted and written off at once.
    for (const lotId of [...new Set(v.lotIds)]) {
      const outcome = await this.db.$transaction(async (tx) => {
        await this.access(tx, who, 'batches.manage');
        await tx.$queryRaw`SELECT id FROM lots WHERE id = ${lotId}::uuid FOR UPDATE`;
        const lot = await tx.lot.findUnique({
          where: { id: lotId },
          include: { settlement: true, unsoldRelist: true },
        });
        if (!lot || lot.batchId !== id)
          return { lotNumber: 'Item', reason: 'It isn’t in this batch.' };
        if (lot.writtenOffAt) return null;
        const stage = lot.preBidsLaunching
          ? 'live'
          : lotStage({
              status: lot.status,
              settlementStatus: lot.settlement?.status,
            });
        // A refunded sale is unsold stock again.
        const refunded = await tx.invoiceLine.count({
          where: { lotId, invoice: { status: 'refunded' } },
        });
        const problem =
          lot.deletedAt !== null
            ? 'It’s deleted.'
            : lot.settlement?.relistLotId || lot.unsoldRelist
              ? 'It has been relisted.'
              : ['live', 'scheduled'].includes(stage)
                ? 'Only draft, unsold, cancelled and refunded items can be written off.'
                : stage === 'sold' && !refunded
                  ? 'It’s sold.'
                  : null;
        if (problem) return { lotNumber: lot.lotNumber, reason: problem };
        const paid = await tx.invoiceLine.count({
          where: { lotId, invoice: { status: 'paid' } },
        });
        if (paid) return { lotNumber: lot.lotNumber, reason: 'It’s sold.' };
        await tx.$queryRaw`SELECT id FROM batches WHERE id = ${id}::uuid FOR SHARE`;
        const batch = await tx.batch.findUniqueOrThrow({ where: { id } });
        if (batch.status === 'closed')
          return {
            lotNumber: lot.lotNumber,
            reason: 'The batch is closed. Reopen it first.',
          };
        const now = new Date();
        await tx.lot.update({
          where: { id: lotId },
          data: {
            writtenOffAt: now,
            archivedAt: lot.archivedAt ?? now,
            comingSoonAt: null,
            isTopDeal: false,
            updatedAt: nextUpdatedAt(lot.updatedAt),
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: who.user.id,
            action: 'lots.written_off',
            entityType: 'lot',
            entityId: lotId,
            afterCiphertext: encryptPii(
              JSON.stringify({ reason: v.reason, batchId: id }),
              'audit',
            ),
          },
        });
        await this.auditRow(tx, who.user.id, 'lots_written_off', id, null, {
          lot: lot.lotNumber,
          reason: v.reason,
        });
        return null;
      });
      if (outcome) skipped.push({ id: lotId, ...outcome });
      else done += 1;
    }
    return batchWriteOffResultSchema.parse({ done, skipped });
  }

  // -------------------------------------------------------- attachments ----
  // Supplier invoices show what stock cost, so files need batches.costs.

  async files(who: AuthIdentity, id: string) {
    return this.db.$transaction(async (tx) => {
      const { flags } = await this.access(tx, who, 'batches.costs');
      await this.one(tx, id, flags.canManage);
      const rows = await tx.batchAttachment.findMany({
        where: { batchId: id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: BATCH_MAX_FILES,
        select: {
          id: true,
          name: true,
          contentType: true,
          bytes: true,
          createdAt: true,
          createdBy: { select: { name: true } },
        },
      });
      return batchFilesSchema.parse({
        items: rows.map((r) => ({
          id: r.id,
          name: r.name,
          type: r.contentType,
          bytes: r.bytes,
          addedAt: r.createdAt.toISOString(),
          addedBy: r.createdBy.name,
        })),
      });
    });
  }

  async addFile(who: AuthIdentity, id: string, input: unknown) {
    const v = parseInput(batchFileUploadSchema, input);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(v.content))
      throw fieldError(
        'file',
        'This file can’t be read. Choose it again.',
        400,
      );
    const bytes = Buffer.from(v.content, 'base64');
    if (!bytes.length || bytes.length > BATCH_FILE_MAX_BYTES)
      throw fieldError('file', 'Keep each file under 5 MB.', 400);
    const type = sniffBatchFile(bytes);
    if (!type)
      throw fieldError('file', 'Attach a PDF, photo or Excel file.', 400);
    return this.db.$transaction(async (tx) => {
      const { costs } = await this.access(tx, who, 'batches.manage');
      if (!costs) throw new ForbiddenException();
      const batch = await this.locked(tx, id);
      // The request key is the file's ID, so a retry adds it once.
      const existing = await tx.batchAttachment.findUnique({
        where: { id: v.idempotencyKey },
        select: { batchId: true, name: true, bytes: true, createdById: true },
      });
      if (existing) {
        if (
          existing.batchId !== id ||
          existing.createdById !== who.user.id ||
          existing.name !== v.name ||
          existing.bytes !== bytes.length
        )
          throw blocked('Choose the file again.');
      } else {
        const count = await tx.batchAttachment.count({
          where: { batchId: id },
        });
        if (count >= BATCH_MAX_FILES)
          throw fieldError('file', 'Attach up to 10 files.', 409);
        await tx.batchAttachment.create({
          data: {
            id: v.idempotencyKey,
            batchId: id,
            name: v.name,
            contentType: type,
            bytes: bytes.length,
            contentCiphertext: encryptPii(v.content, filePurpose),
            createdById: who.user.id,
          },
        });
        await this.auditRow(tx, who.user.id, 'file_added', id, null, {
          name: v.name,
          bytes: bytes.length,
        });
      }
      return { id: v.idempotencyKey, message: `Attached to ${batch.code}.` };
    });
  }

  async file(who: AuthIdentity, id: string, fileId: string) {
    const row = await this.db.$transaction(async (tx) => {
      const { flags } = await this.access(tx, who, 'batches.costs');
      await this.one(tx, id, flags.canManage);
      return tx.batchAttachment.findFirst({
        where: { id: fileId, batchId: id },
      });
    });
    if (!row) throw new NotFoundException('File not found.');
    return {
      name: row.name,
      type: row.contentType,
      content: Buffer.from(
        decryptPii(Buffer.from(row.contentCiphertext), filePurpose),
        'base64',
      ),
    };
  }

  async removeFile(who: AuthIdentity, id: string, fileId: string) {
    return this.db.$transaction(async (tx) => {
      const { costs } = await this.access(tx, who, 'batches.manage');
      if (!costs) throw new ForbiddenException();
      await this.locked(tx, id);
      const row = await tx.batchAttachment.findFirst({
        where: { id: fileId, batchId: id },
        select: { name: true, bytes: true },
      });
      if (!row) throw new NotFoundException('File not found.');
      await tx.batchAttachment.delete({ where: { id: fileId } });
      await this.auditRow(tx, who.user.id, 'file_removed', id, row, {});
      return { id: fileId, message: `${row.name} removed.` };
    });
  }

  async deleteUnused(who: AuthIdentity, input: unknown) {
    const v = parseInput(batchDeleteSchema, input);
    return this.changed(who, v, 'deleted', 'batches.manage', async (tx) => {
      const { flags } = await this.access(tx, who, 'batches.manage');
      if (!flags.canManage) throw new ForbiddenException();
      await lockRecalculation(tx);
      const before = await this.locked(tx, v.id);
      assertFresh(before.updatedAt, v.expectedUpdatedAt, 'batch');
      if (v.confirmation.trim() !== before.code)
        throw blocked('Type the batch code to confirm deletion.');
      if (
        before.status !== 'arriving' ||
        before.receivedOn ||
        before.itemsReceived !== null ||
        before.stockLinkedAt ||
        (await tx.lot.count({ where: { batchId: v.id } })) ||
        (await tx.lotCost.count({ where: { batchId: v.id } }))
      )
        throw blocked(
          'Only unused batches can be deleted. Batches with received stock or linked items must be kept.',
        );
      const after = await tx.batch.update({
        where: { id: v.id },
        data: {
          deletedAt: new Date(),
          deletedById: who.user.id,
          deleteReason: v.reason,
          updatedAt: nextUpdatedAt(before.updatedAt),
        },
      });
      return {
        result: {
          id: v.id,
          message: `${before.code} moved to Deleted. You can restore it for ${BATCH_RESTORE_DAYS} days.`,
        },
        before,
        after,
      };
    });
  }
  async restoreUnused(who: AuthIdentity, input: unknown) {
    const v = parseInput(batchReasonSchema, input);
    return this.changed(who, v, 'restored', 'batches.manage', async (tx) => {
      const { flags } = await this.access(tx, who, 'batches.manage');
      if (!flags.canManage) throw new ForbiddenException();
      await lockRecalculation(tx);
      const before = await this.locked(tx, v.id, true);
      assertFresh(before.updatedAt, v.expectedUpdatedAt, 'batch');
      if (
        !before.deletedAt ||
        Date.parse(batchPurgeAt(before.deletedAt.toISOString())) <= Date.now()
      )
        throw blocked(
          `This batch cannot be restored. Restoration is available for ${BATCH_RESTORE_DAYS} days after deletion.`,
        );
      const after = await tx.batch.update({
        where: { id: v.id },
        data: {
          deletedAt: null,
          deletedById: null,
          deleteReason: null,
          updatedAt: nextUpdatedAt(before.updatedAt),
        },
      });
      return {
        result: { id: v.id, message: `${before.code} restored.` },
        before,
        after,
      };
    });
  }
  cleanupDeleted() {
    return purgeDeletedBatches(this.db);
  }
  recalculate() {
    return recalculateQueued(this.db);
  }
}
