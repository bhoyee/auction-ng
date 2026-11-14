import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  allowedLotActions,
  duplicateLotFields,
  fromLedgerKobo,
  LOT_EXPORT_MAX_ROWS,
  LOT_MAX_PHOTOS,
  LOT_RESTORE_DAYS,
  lotActivityRowSchema,
  lotBidRowSchema,
  lotBulkResultSchema,
  lotBulkSchema,
  lotCsvHeaders,
  lotDeleteRule,
  lotDeleteSchema,
  lotComingSoonInputSchema,
  lotEditLocks,
  lotEditorSchema,
  lotInvoiceSchema,
  lotLabelSchema,
  lotListPageSchema,
  lotListQuerySchema,
  lotListSetupSchema,
  lotPhotoOrderSchema,
  lotPreferencesSchema,
  lotSaveSchema,
  lotSavedViewSchema,
  lotStage,
  lotTabPageSchema,
  lotVersionSchema,
  lotViewSaveSchema,
  lotViewSchema,
  lotWatcherRowSchema,
  maskMonitorName,
  validateLotCsv,
  type LotCsvField,
  type LotForm,
  type LotStage,
} from '@auction-ng/shared';
import type { Prisma } from '../generated/prisma/client';
import { staffAccess } from '../auth/staff-access';
import { LedgerService } from '../ledger/ledger-service';
import { effectiveCategory } from '../lot-setup/category-service';
import { fieldError } from '../lot-setup/lot-setup-base';
import {
  lotSetupReferences,
  publishProblems,
} from '../lot-setup/publish-rules';
import { decryptPii, encryptPii } from '../security/pii';
import { pageIds, rowDetails, summary, tabCounts } from './lots-query';

type Tx = Prisma.TransactionClient;
const isUniqueViolation = (error: unknown) =>
  !!error &&
  typeof error === 'object' &&
  'code' in error &&
  (error as { code?: string }).code === 'P2002';
// Queries inside one transaction share a connection, so run them in order
// (parallel queries on one client are deprecated by the Postgres driver).
async function inOrder<T extends unknown[]>(
  ...tasks: { [K in keyof T]: () => PromiseLike<T[K]> }
): Promise<T> {
  const out: unknown[] = [];
  for (const task of tasks) out.push(await task());
  return out as T;
}
// Conflicts carry their message to the form (the error filter keeps field errors).
const conflict = (message: string) => fieldError('form', message, 409);
// Excel needs the UTF-8 byte-order mark to show ₦ and accents correctly.
const BOM = String.fromCharCode(0xfeff);
type Access = Awaited<ReturnType<typeof staffAccess>>;
type LotRow = Prisma.LotGetPayload<{
  include: { settlement: true; images: true };
}>;

const kobo = (v: bigint | null | undefined) =>
  v === null || v === undefined ? null : fromLedgerKobo(v);
const runMinutes = (lot: {
  runTimeMinutes: number | null;
  startAt: Date;
  endAt: Date;
}) =>
  lot.runTimeMinutes ??
  Math.max(
    60,
    Math.round((lot.endAt.getTime() - lot.startAt.getTime()) / 60_000),
  );
const pageSchema = z
  .object({ cursor: z.string().max(400).optional() })
  .strict();
const offsetCursor = {
  read(v: string | undefined) {
    const n = v ? Number(Buffer.from(v, 'base64url').toString()) : 0;
    if (!Number.isInteger(n) || n < 0 || n > 100_000)
      throw new BadRequestException('Reload and try again.');
    return n;
  },
  write(n: number) {
    return Buffer.from(String(n)).toString('base64url');
  },
};
const activityLabels: Record<string, string> = {
  'lots.created': 'Created',
  'lots.edited': 'Edited',
  'lots.saved': 'Saved',
  'lots.duplicated': 'Duplicated from another lot',
  'lots.duplicate_created': 'Duplicated',
  'lots.photos_updated': 'Photos changed',
  'lots.image_added': 'Photo added',
  'lots.scheduled': 'Scheduled to publish',
  'lots.upcoming_cancelled': 'Scheduled publish cancelled',
  'lots.archived': 'Archived',
  'lots.unarchived': 'Taken out of the archive',
  'lots.deleted': 'Deleted',
  'lots.restored': 'Restored',
  'lots.bulk_edited': 'Changed in a bulk edit',
  'lots.moved': 'Moved',
  'lots.imported': 'Imported from CSV',
  'lots.unsold_auto_relisted': 'Relisted automatically',
  'lots.unsold_relisted': 'Relisted by staff',
  'lots.fixed_price_updated': 'Buy now price changed',
  'lots.top_deal_updated': 'Top Deals changed',
  'lots.bidders_viewed': 'Bidder names viewed',
};

async function audit(
  tx: Tx,
  actorId: string,
  action: string,
  entityId: string,
  before: unknown,
  after: unknown,
) {
  await tx.auditLog.create({
    data: {
      actorId,
      action,
      entityType: 'lot',
      entityId,
      beforeCiphertext:
        before === null ? null : encryptPii(JSON.stringify(before), 'audit'),
      afterCiphertext: encryptPii(JSON.stringify(after), 'audit'),
    },
  });
}

function formOf(lot: LotRow): LotForm {
  return {
    title: lot.title,
    description: lot.description,
    condition: lot.condition as LotForm['condition'],
    categoryId: lot.categoryId,
    locationId: lot.locationId,
    binId: lot.binId,
    brandId: lot.brandId,
    supplierId: lot.supplierId,
    startPriceKobo: fromLedgerKobo(lot.startPriceKobo),
    retailPriceKobo: fromLedgerKobo(lot.retailPriceKobo),
    // Drafts keep their chosen run time; once scheduled, the real start and
    // end (set by scheduling, relists or extensions) are the run time.
    runTimeMinutes: Math.min(
      10080,
      Math.max(
        60,
        lot.status === 'draft'
          ? runMinutes(lot)
          : Math.round((lot.endAt.getTime() - lot.startAt.getTime()) / 60_000),
      ),
    ),
    details: (lot.details ?? {}) as LotForm['details'],
    included: lot.included,
    defects: lot.defects,
  };
}

// Lots inventory (T15e). Permissions are checked here, not only in the UI.
export class LotsAdminService {
  constructor(private readonly ledger: LedgerService) {}
  private get db() {
    return this.ledger.db;
  }

  private async access(tx: Tx, actorId: string, permission: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(715,1)`;
    const access = await staffAccess(tx, actorId);
    if (!access.permissions.includes(permission as never))
      throw new ForbiddenException(
        'Your account does not have permission for this action.',
      );
    return access;
  }

  /** Records of a deleted lot are for admins (records.purge) only. */
  private async visible(tx: Tx, access: Access, id: string) {
    const lot = await tx.lot.findUnique({
      where: { id },
      select: { deletedAt: true },
    });
    if (
      !lot ||
      (lot.deletedAt && !access.permissions.includes('records.purge'))
    )
      throw new NotFoundException('Lot not found.');
  }

  private async lockLot(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM lots WHERE id=${id}::uuid FOR UPDATE`;
    const lot = await tx.lot.findUnique({
      where: { id },
      include: { settlement: true, images: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!lot) throw new NotFoundException('Lot not found.');
    return lot;
  }

  private async state(tx: Tx, lot: LotRow) {
    const [bids, prebids] = await inOrder(
      () => tx.bid.count({ where: { lotId: lot.id } }),
      () =>
        tx.preBid.count({
          where: { lotId: lot.id, status: { in: ['active', 'launching'] } },
        }),
    );
    // While pre-bids are launching the lot is already in the bid engine, so
    // it is treated as live (no price/time edits, no delete).
    const stage = lot.preBidsLaunching
      ? 'live'
      : lotStage({
          status: lot.status,
          settlementStatus: lot.settlement?.status,
        });
    return { stage, bids, hasBids: bids + prebids > 0 };
  }

  private actionsFor(
    access: Access,
    lot: {
      stage: LotStage;
      hasBids: boolean;
      archivedAt: Date | null;
      deletedAt: Date | null;
      createdById: string | null;
    },
  ) {
    return allowedLotActions({
      stage: lot.stage,
      hasBids: lot.hasBids,
      archived: !!lot.archivedAt,
      deleted: !!lot.deletedAt,
      deletedAt: lot.deletedAt,
      now: new Date(),
      isCreator: lot.createdById === access.user.id,
      permissions: access.permissions,
    });
  }

  // ----------------------------------------------------------- list ----

  async list(actorId: string, input: unknown) {
    const f = lotListQuerySchema.parse(input);
    return this.db.$transaction(async (tx) => {
      const access = await this.access(tx, actorId, 'inventory.read');
      const canSeeDeleted = access.permissions.includes('records.purge');
      // Buyer names are for admins and ops managers; others see the mask.
      const fullNames = ['admin', 'manager'].includes(access.user.role);
      if (f.tab === 'deleted' && !canSeeDeleted)
        throw new ForbiddenException('Only admins can see deleted lots.');
      const [counts, cards, page] = await inOrder(
        () => tabCounts(tx, f, canSeeDeleted),
        () => summary(tx),
        () => pageIds(tx, f),
      );
      const rows = await rowDetails(tx, page.ids);
      return lotListPageSchema.parse({
        items: rows.map((r) => {
          const needed = Math.max(1, r.min_photos ?? 1);
          const hasBids = Number(r.bids) + Number(r.prebids) > 0;
          return {
            id: r.id,
            lotNumber: r.lot_number,
            title: r.title,
            thumbnailUrl: r.thumbnail_url,
            categoryName: r.category_name,
            categoryIcon: r.category_icon,
            condition: r.condition,
            locationName: r.location_name,
            locationCode: r.location_code,
            binCode: r.bin_code,
            stage: r.stage,
            archived: !!r.archived_at,
            deleted: !!r.deleted_at,
            deletedAt: r.deleted_at?.toISOString() ?? null,
            deleteReason: r.delete_reason,
            startsAt: r.start_at.toISOString(),
            endsAt: r.end_at.toISOString(),
            runTimeMinutes: runMinutes({
              runTimeMinutes: r.run_time_minutes,
              startAt: r.start_at,
              endAt: r.end_at,
            }),
            startPriceKobo: fromLedgerKobo(r.start_price_kobo),
            currentPriceKobo: kobo(r.hammer_kobo ?? r.current_price_kobo),
            retailPriceKobo: fromLedgerKobo(r.retail_price_kobo),
            bids: Number(r.bids),
            watching: Number(r.watching),
            photos: Number(r.photos),
            photosNeeded: Math.max(0, needed - Number(r.photos)),
            winnerName:
              r.stage !== 'sold' || !r.winner_name
                ? null
                : fullNames
                  ? r.winner_name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((p, i) => (i ? `${p[0]}.` : p))
                      .join(' ')
                  : maskMonitorName(r.winner_name),
            addedBy:
              r.created_by_id && r.created_by_name
                ? { id: r.created_by_id, name: r.created_by_name }
                : null,
            createdAt: r.created_at.toISOString(),
            updatedAt: r.updated_at.toISOString(),
            comingSoon: r.stage === 'draft' && r.coming_soon_at !== null,
            hasBids,
            actions: this.actionsFor(access, {
              stage: r.stage,
              hasBids,
              archivedAt: r.archived_at,
              deletedAt: r.deleted_at,
              createdById: r.created_by_id,
            }),
          };
        }),
        counts,
        summary: cards,
        total: counts[f.tab],
        nextCursor: page.nextCursor,
        serverTime: new Date().toISOString(),
        canCreate: access.permissions.includes('inventory.write'),
        canSeeDeleted,
      });
    });
  }

  // ------------------------------------------------- views and columns --

  async setup(actorId: string) {
    return this.db.$transaction(async (tx) => {
      const access = await this.access(tx, actorId, 'inventory.read');
      const views = await tx.staffLotView.findMany({
        where: { userId: actorId },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        take: 20,
      });
      const prefs = (access.user.staffPreferences ?? {}) as {
        lots?: unknown;
      };
      const parsed = lotPreferencesSchema.safeParse(prefs.lots);
      return lotListSetupSchema.parse({
        views: views.map((v) => ({ id: v.id, name: v.name, query: v.query })),
        preferences: parsed.success
          ? parsed.data
          : { hiddenColumns: [], layout: 'table' },
      });
    });
  }

  async saveView(actorId: string, input: unknown) {
    const v = lotViewSaveSchema.parse(input);
    lotListQuerySchema.partial().parse(v.query);
    return this.db.$transaction(async (tx) => {
      await this.access(tx, actorId, 'inventory.read');
      if ((await tx.staffLotView.count({ where: { userId: actorId } })) >= 20)
        throw fieldError('name', 'You can keep up to 20 saved views.', 400);
      if (
        await tx.staffLotView.findFirst({
          where: { userId: actorId, name: v.name },
        })
      )
        throw fieldError(
          'name',
          'You already have a view with this name.',
          409,
        );
      const row = await tx.staffLotView.create({
        data: {
          userId: actorId,
          name: v.name,
          query: v.query,
          sortOrder: await tx.staffLotView.count({
            where: { userId: actorId },
          }),
        },
      });
      return lotSavedViewSchema.parse({
        id: row.id,
        name: row.name,
        query: row.query,
      });
    });
  }

  async deleteView(actorId: string, id: string) {
    return this.db.$transaction(async (tx) => {
      await this.access(tx, actorId, 'inventory.read');
      await tx.staffLotView.deleteMany({ where: { id, userId: actorId } });
      return { id };
    });
  }

  async savePreferences(actorId: string, input: unknown) {
    const prefs = lotPreferencesSchema.parse(input);
    return this.db.$transaction(async (tx) => {
      const access = await this.access(tx, actorId, 'inventory.read');
      const current = (access.user.staffPreferences ?? {}) as Record<
        string,
        unknown
      >;
      await tx.user.update({
        where: { id: actorId },
        data: { staffPreferences: { ...current, lots: prefs } },
      });
      return prefs;
    });
  }

  // ----------------------------------------------------- view a lot ----

  private async editorOf(tx: Tx, lot: LotRow) {
    const { stage, hasBids } = await this.state(tx, lot);
    return {
      stage,
      hasBids,
      editor: lotEditorSchema.parse({
        id: lot.id,
        lotNumber: lot.lotNumber,
        stage,
        archived: !!lot.archivedAt,
        lot: formOf(lot),
        photos: lot.images.map((i) => ({
          id: i.id,
          url: i.url,
          thumbnailUrl: i.thumbnailUrl,
          sortOrder: i.sortOrder,
          isDefect: i.isDefect,
        })),
        hasBids,
        locks: lotEditLocks({ stage, hasBids }),
        comingSoon: stage === 'draft' && lot.comingSoonAt !== null,
        isTopDeal: lot.isTopDeal,
        topDealOrder: lot.topDealOrder,
        updatedAt: lot.updatedAt.toISOString(),
      }),
    };
  }

  async editor(actorId: string, id: string) {
    return this.db.$transaction(async (tx) => {
      await this.access(tx, actorId, 'inventory.read');
      const lot = await tx.lot.findUnique({
        where: { id },
        include: {
          settlement: true,
          images: { orderBy: { sortOrder: 'asc' } },
        },
      });
      if (!lot || lot.deletedAt) throw new NotFoundException('Lot not found.');
      return (await this.editorOf(tx, lot)).editor;
    });
  }

  async view(actorId: string, id: string) {
    return this.db.$transaction(async (tx) => {
      const access = await this.access(tx, actorId, 'inventory.read');
      const lot = await tx.lot.findUnique({
        where: { id },
        include: {
          settlement: true,
          images: { orderBy: { sortOrder: 'asc' } },
          category: { include: { parent: true } },
          location: true,
          bin: true,
          brand: true,
          supplier: true,
          createdBy: { select: { id: true, name: true } },
        },
      });
      if (!lot) throw new NotFoundException('Lot not found.');
      if (lot.deletedAt && !access.permissions.includes('records.purge'))
        throw new NotFoundException('Lot not found.');
      const { stage, hasBids, editor } = await this.editorOf(tx, lot);
      const [top, watching, activityCount, rules, scheduledAudit] =
        await inOrder(
          () =>
            tx.bid.findFirst({
              where: { lotId: id },
              orderBy: [{ amountKobo: 'desc' }, { createdAt: 'asc' }],
              include: { user: { select: { id: true, name: true } } },
            }),
          () => tx.watchlist.count({ where: { lotId: id } }),
          () =>
            tx.auditLog.count({ where: { entityType: 'lot', entityId: id } }),
          () => effectiveCategory(tx, lot.category),
          () =>
            tx.auditLog.findFirst({
              where: {
                entityType: 'lot',
                entityId: id,
                action: 'lots.scheduled',
              },
              orderBy: { createdAt: 'desc' },
              include: { actor: { select: { name: true } } },
            }),
        );
      const bids = await tx.bid.count({ where: { lotId: id } });
      let leader: { name: string; pastWins: number; strikes: number } | null =
        null;
      if (top && ['admin', 'manager'].includes(access.user.role)) {
        const [pastWins, strikes] = await inOrder(
          () =>
            tx.lotSettlement.count({
              where: { winnerId: top.userId, status: 'paid' },
            }),
          () =>
            tx.strike.count({ where: { userId: top.userId, revokedAt: null } }),
        );
        leader = { name: top.user.name, pastWins, strikes };
      }
      const wat = (d: Date) =>
        new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Africa/Lagos',
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }).format(d);
      const ended = ['sold', 'unsold'].includes(stage);
      const journey = [
        {
          key: 'created' as const,
          label: 'Created',
          detail: `${lot.createdBy?.name ?? 'Staff'} · ${wat(lot.createdAt)}`,
          state: 'done' as const,
          at: lot.createdAt.toISOString(),
        },
        {
          key: 'scheduled' as const,
          label:
            stage === 'draft'
              ? 'Publish'
              : `Published, ${Math.round(runMinutes(lot) / 60)} h`,
          detail:
            stage === 'draft'
              ? 'not published yet'
              : `${scheduledAudit?.actor?.name ?? 'Staff'} · starts ${wat(lot.startAt)}`,
          state: (stage === 'draft' ? 'current' : 'done') as 'current' | 'done',
          at: stage === 'draft' ? null : lot.startAt.toISOString(),
        },
        {
          key: 'live' as const,
          label: stage === 'live' ? `Live · ${bids} bids` : 'Live',
          detail: `ends ${wat(lot.endAt)}, may extend 2 min per late bid`,
          state: (stage === 'live' ? 'current' : ended ? 'done' : 'next') as
            'current' | 'done' | 'next',
          at: ended || stage === 'live' ? lot.startAt.toISOString() : null,
        },
        {
          key: 'ended' as const,
          label:
            stage === 'sold'
              ? 'Sold'
              : stage === 'unsold'
                ? 'Ended with no sale'
                : 'Ends',
          detail: ended
            ? wat(lot.settlement?.closedAt ?? lot.endAt)
            : 'when the countdown reaches zero',
          state: (ended ? 'done' : 'next') as 'done' | 'next',
          at: ended
            ? (lot.settlement?.closedAt ?? lot.endAt).toISOString()
            : null,
        },
        {
          key: 'pickup' as const,
          label: 'Invoice and pickup',
          detail: `after it ends · ${lot.location.name}${lot.bin ? `, bin ${lot.bin.code}` : ''}`,
          state: (stage === 'sold' ? 'current' : 'next') as 'current' | 'next',
          at: null,
        },
      ];
      return lotViewSchema.parse({
        editor,
        categoryPath: lot.category.parent
          ? `${lot.category.parent.name} › ${lot.category.name}`
          : lot.category.name,
        categoryFields: rules.fields.map((f) => ({
          key: f.key,
          name: f.name,
          type: f.type,
        })),
        locationName: lot.location.name,
        locationCode: lot.location.code,
        binCode: lot.bin?.code ?? null,
        brandName: lot.brand?.name ?? null,
        supplierName: lot.supplier?.name ?? null,
        startsAt: lot.startAt.toISOString(),
        endsAt: lot.endAt.toISOString(),
        currentPriceKobo: kobo(lot.settlement?.hammerKobo ?? top?.amountKobo),
        fixedPriceKobo: kobo(lot.fixedPriceKobo),
        bids,
        watching,
        leader,
        addedBy: lot.createdBy,
        createdAt: lot.createdAt.toISOString(),
        deletedAt: lot.deletedAt?.toISOString() ?? null,
        deleteReason: lot.deleteReason,
        journey,
        actions: this.actionsFor(access, {
          stage,
          hasBids,
          archivedAt: lot.archivedAt,
          deletedAt: lot.deletedAt,
          createdById: lot.createdById,
        }),
        activityCount,
        serverTime: new Date().toISOString(),
      });
    });
  }

  async bids(actorId: string, id: string, input: unknown) {
    const { cursor } = pageSchema.parse(input);
    const offset = offsetCursor.read(cursor);
    return this.db.$transaction(async (tx) => {
      const access = await this.access(tx, actorId, 'inventory.read');
      await this.visible(tx, access, id);
      const full = ['admin', 'manager'].includes(access.user.role);
      const [rows, leader] = await inOrder(
        () =>
          tx.bid.findMany({
            where: { lotId: id },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip: offset,
            take: 51,
            include: { user: { select: { name: true } } },
          }),
        () =>
          tx.bid.findFirst({
            where: { lotId: id },
            orderBy: [{ amountKobo: 'desc' }, { createdAt: 'asc' }],
            select: { id: true },
          }),
      );
      // Full names are for admins and ops managers; each look is audited.
      if (full && rows.length)
        await audit(tx, actorId, 'lots.bidders_viewed', id, null, {
          rows: Math.min(rows.length, 50),
        });
      return lotTabPageSchema(lotBidRowSchema).parse({
        items: rows.slice(0, 50).map((b) => ({
          id: b.id,
          at: b.createdAt.toISOString(),
          bidderName: full ? b.user.name : null,
          maskedName: maskMonitorName(b.user.name),
          amountKobo: fromLedgerKobo(b.amountKobo),
          proxy: b.isProxy,
          leading: b.id === leader?.id,
        })),
        nextCursor: rows.length > 50 ? offsetCursor.write(offset + 50) : null,
      });
    });
  }

  async watchers(actorId: string, id: string, input: unknown) {
    const { cursor } = pageSchema.parse(input);
    const offset = offsetCursor.read(cursor);
    return this.db.$transaction(async (tx) => {
      const access = await this.access(tx, actorId, 'inventory.read');
      await this.visible(tx, access, id);
      const full = ['admin', 'manager'].includes(access.user.role);
      const rows = await tx.watchlist.findMany({
        where: { lotId: id },
        orderBy: [{ createdAt: 'desc' }, { userId: 'desc' }],
        skip: offset,
        take: 51,
        include: { user: { select: { name: true } } },
      });
      return lotTabPageSchema(lotWatcherRowSchema).parse({
        items: rows.slice(0, 50).map((w) => ({
          name: full ? w.user.name : null,
          maskedName: maskMonitorName(w.user.name),
          since: w.createdAt.toISOString(),
        })),
        nextCursor: rows.length > 50 ? offsetCursor.write(offset + 50) : null,
      });
    });
  }

  async activity(actorId: string, id: string, input: unknown) {
    const { cursor } = pageSchema.parse(input);
    const offset = offsetCursor.read(cursor);
    return this.db.$transaction(async (tx) => {
      const access = await this.access(tx, actorId, 'inventory.read');
      await this.visible(tx, access, id);
      const rows = await tx.auditLog.findMany({
        where: { entityType: 'lot', entityId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: 51,
        include: { actor: { select: { name: true } } },
      });
      return lotTabPageSchema(lotActivityRowSchema).parse({
        items: rows.slice(0, 50).map((a) => ({
          id: a.id,
          at: a.createdAt.toISOString(),
          actor: a.actor?.name ?? 'System',
          action: a.action,
          label:
            activityLabels[a.action] ??
            a.action.replace(/^lots?\./, '').replaceAll('_', ' '),
        })),
        nextCursor: rows.length > 50 ? offsetCursor.write(offset + 50) : null,
      });
    });
  }

  async invoice(actorId: string, id: string) {
    return this.db.$transaction(async (tx) => {
      const access = await this.access(tx, actorId, 'inventory.read');
      await this.visible(tx, access, id);
      const settlement = await tx.lotSettlement.findUnique({
        where: { lotId: id },
        include: { winner: { select: { name: true } } },
      });
      const invoice = settlement?.invoiceId
        ? await tx.invoice.findUnique({
            where: { id: settlement.invoiceId },
            include: { fulfilment: true },
          })
        : null;
      const full = ['admin', 'manager'].includes(access.user.role);
      return lotInvoiceSchema.parse({
        invoiceNumber: invoice?.number ?? null,
        invoiceStatus: invoice?.status ?? null,
        hammerKobo: kobo(settlement?.hammerKobo),
        totalKobo: kobo(invoice?.totalKobo),
        winnerName: settlement?.winner
          ? full
            ? settlement.winner.name
            : maskMonitorName(settlement.winner.name)
          : null,
        pickupStatus: invoice?.fulfilment?.status ?? null,
        collectedAt: invoice?.fulfilment?.collectedAt?.toISOString() ?? null,
      });
    });
  }

  // ---------------------------------------------------- create / edit ----

  private async checkReferences(
    tx: Tx,
    lot: LotForm,
    currentBinId: string | null,
  ) {
    const [category, location] = await inOrder(
      () =>
        tx.category.findFirst({
          where: { id: lot.categoryId, archivedAt: null },
        }),
      () =>
        tx.location.findFirst({
          where: { id: lot.locationId, archivedAt: null },
        }),
    );
    if (!category)
      throw fieldError('categoryId', 'Pick a category from Lot setup.', 400);
    if (!location)
      throw fieldError(
        'locationId',
        'Pick a pickup location from Lot setup.',
        400,
      );
    await lotSetupReferences(tx, {
      locationId: lot.locationId,
      binId: lot.binId,
      brandId: lot.brandId,
      currentBinId,
    });
    if (
      lot.supplierId &&
      !(await tx.supplier.findFirst({
        where: { id: lot.supplierId, deletedAt: null },
      }))
    )
      throw fieldError('supplierId', 'Pick a supplier from the list.', 400);
  }

  /** Create (id null) or edit a lot. Locked fields can't change. */
  /** A twin request with the same key returns the first one's result. */
  async save(actorId: string, id: string | null, input: unknown) {
    try {
      return await this.saveOnce(actorId, id, input);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const v = lotSaveSchema.parse(input);
      const prior = await this.db.idempotencyKey.findUnique({
        where: {
          scope_key: {
            scope: 'lot-save',
            key: `${actorId}:${v.idempotencyKey}`,
          },
        },
      });
      if (!prior?.responseCiphertext) throw error;
      return lotEditorSchema.parse(
        JSON.parse(
          decryptPii(Buffer.from(prior.responseCiphertext), 'lot-save'),
        ),
      );
    }
  }

  private async saveOnce(actorId: string, id: string | null, input: unknown) {
    const v = lotSaveSchema.parse(input);
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          id,
          lot: v.lot,
          expectedUpdatedAt: v.expectedUpdatedAt,
        }),
      )
      .digest('hex');
    return this.db.$transaction(
      async (tx) => {
        await this.access(tx, actorId, 'inventory.write');
        const replay = await this.replay(
          tx,
          'lot-save',
          actorId,
          v.idempotencyKey,
          requestHash,
        );
        if (replay) return lotEditorSchema.parse(replay);
        let result;
        if (!id) {
          await this.checkReferences(tx, v.lot, null);
          const now = new Date();
          const row = await tx.lot.create({
            data: {
              ...this.data(v.lot),
              status: 'draft',
              createdById: actorId,
              startAt: now,
              endAt: new Date(now.getTime() + v.lot.runTimeMinutes * 60_000),
            },
            include: { settlement: true, images: true },
          });
          result = (await this.editorOf(tx, row)).editor;
          await audit(tx, actorId, 'lots.created', row.id, null, v.lot);
        } else {
          const before = await this.lockLot(tx, id);
          if (before.deletedAt) throw new NotFoundException('Lot not found.');
          if (before.updatedAt.toISOString() !== v.expectedUpdatedAt)
            throw conflict(
              'Someone else changed this lot. Reload it to see their changes.',
            );
          const { stage, hasBids } = await this.state(tx, before);
          const locks = lotEditLocks({ stage, hasBids });
          if (!locks.editable || before.archivedAt)
            throw conflict(locks.reason ?? 'Archived lots can’t be edited.');
          const old = formOf(before);
          const changed = (Object.keys(v.lot) as (keyof LotForm)[]).filter(
            (k) => JSON.stringify(v.lot[k]) !== JSON.stringify(old[k]),
          );
          const blocked = changed.filter(
            (k) =>
              (locks.priceLocked &&
                (k === 'startPriceKobo' || k === 'retailPriceKobo')) ||
              (locks.runTimeLocked && k === 'runTimeMinutes') ||
              (locks.categoryLocked && k === 'categoryId') ||
              (locks.locationLocked && k === 'locationId'),
          );
          if (blocked[0])
            throw fieldError(
              blocked[0],
              locks.reason ?? 'This can’t change now.',
              409,
            );
          await this.checkReferences(tx, v.lot, before.binId);
          // Only a draft's end follows its run time; scheduled and live lots
          // keep the times the scheduler or bid engine set.
          const timing =
            stage === 'draft'
              ? {
                  endAt: new Date(
                    before.startAt.getTime() + v.lot.runTimeMinutes * 60_000,
                  ),
                }
              : {};
          const row = await tx.lot.update({
            where: { id },
            data: {
              ...this.data(v.lot),
              ...timing,
              updatedAt: new Date(
                Math.max(Date.now(), before.updatedAt.getTime() + 1),
              ),
            },
            include: {
              settlement: true,
              images: { orderBy: { sortOrder: 'asc' } },
            },
          });
          result = (await this.editorOf(tx, row)).editor;
          await audit(tx, actorId, 'lots.edited', id, old, {
            ...v.lot,
            changed,
          });
          if (locks.tellBuyers && changed.length)
            await this.tellBuyers(tx, actorId, id, changed);
        }
        await this.remember(
          tx,
          'lot-save',
          actorId,
          v.idempotencyKey,
          requestHash,
          result,
        );
        return result;
      },
      { maxWait: 15000, timeout: 20000 },
    );
  }

  private data(lot: LotForm) {
    return {
      title: lot.title,
      description: lot.description,
      condition: lot.condition,
      categoryId: lot.categoryId,
      locationId: lot.locationId,
      binId: lot.binId,
      brandId: lot.brandId,
      supplierId: lot.supplierId,
      startPriceKobo: BigInt(lot.startPriceKobo),
      retailPriceKobo: BigInt(lot.retailPriceKobo),
      runTimeMinutes: lot.runTimeMinutes,
      details: lot.details,
      included: lot.included,
      defects: lot.defects,
    };
  }

  /** "Lot details updated" through the bidder/watcher message outbox. */
  private async tellBuyers(
    tx: Tx,
    actorId: string,
    lotId: string,
    changed: string[],
  ) {
    const words: Record<string, string> = {
      title: 'title',
      description: 'description',
      condition: 'condition',
      details: 'item details',
      included: 'what’s included',
      defects: 'missing items or defects',
      binId: 'pickup shelf',
      brandId: 'brand',
      photos: 'photos',
    };
    const list = [...new Set(changed.map((c) => words[c]).filter(Boolean))];
    if (!list.length) return;
    await tx.lotBidderMessage.create({
      data: {
        id: randomUUID(),
        lotId,
        actorId,
        cutoffAt: new Date(),
        messageCiphertext: encryptPii(
          `We updated this lot’s ${list.join(', ')}. Please check the lot page.`,
          'lot-message',
        ),
      },
    });
  }

  async photos(actorId: string, id: string, input: unknown) {
    const v = lotPhotoOrderSchema.parse(input);
    return this.db.$transaction(async (tx) => {
      await this.access(tx, actorId, 'inventory.write');
      const lot = await this.lockLot(tx, id);
      if (lot.deletedAt) throw new NotFoundException('Lot not found.');
      if (lot.updatedAt.toISOString() !== v.expectedUpdatedAt)
        throw conflict('This lot changed. Reload it first.');
      const { stage, hasBids } = await this.state(tx, lot);
      const locks = lotEditLocks({ stage, hasBids });
      if (!locks.editable || lot.archivedAt)
        throw conflict(locks.reason ?? 'This lot can’t change.');
      const ids = new Set(lot.images.map((i) => i.id));
      const keep = v.order.filter((p) => !v.remove.includes(p));
      if (
        [...v.order, ...v.remove, ...v.defects].some((p) => !ids.has(p)) ||
        new Set(v.order).size !== lot.images.length
      )
        throw conflict('The photos changed. Reload the lot.');
      if (keep.length > LOT_MAX_PHOTOS)
        throw fieldError(
          'photos',
          `Keep at most ${LOT_MAX_PHOTOS} photos.`,
          400,
        );
      if (stage !== 'draft' && keep.length === 0)
        throw fieldError(
          'photos',
          'A published lot needs at least one photo.',
          400,
        );
      if (v.remove.length)
        await tx.lotImage.deleteMany({
          where: { lotId: id, id: { in: v.remove } },
        });
      // Two passes keep (lot, sort order) unique while reordering.
      for (const [i, photo] of keep.entries())
        await tx.lotImage.update({
          where: { id: photo },
          data: { sortOrder: 1000 + i },
        });
      for (const [i, photo] of keep.entries())
        await tx.lotImage.update({
          where: { id: photo },
          data: { sortOrder: i, isDefect: v.defects.includes(photo) },
        });
      const row = await tx.lot.update({
        where: { id },
        data: {
          updatedAt: new Date(
            Math.max(Date.now(), lot.updatedAt.getTime() + 1),
          ),
        },
        include: {
          settlement: true,
          images: { orderBy: { sortOrder: 'asc' } },
        },
      });
      await audit(tx, actorId, 'lots.photos_updated', id, null, {
        order: keep,
        defects: v.defects,
        removed: v.remove,
      });
      if (locks.tellBuyers) await this.tellBuyers(tx, actorId, id, ['photos']);
      return (await this.editorOf(tx, row)).editor;
    });
  }

  // ------------------------------------------- duplicate / archive / delete --

  async duplicate(actorId: string, id: string, input: unknown) {
    try {
      return await this.duplicateOnce(actorId, id, input);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const { idempotencyKey } = z
        .object({ idempotencyKey: z.uuid() })
        .strict()
        .parse(input);
      const prior = await this.db.idempotencyKey.findUnique({
        where: {
          scope_key: {
            scope: 'lot-duplicate',
            key: `${actorId}:${idempotencyKey}`,
          },
        },
      });
      if (!prior?.responseCiphertext) throw error;
      return z
        .object({ id: z.uuid() })
        .parse(
          JSON.parse(
            decryptPii(Buffer.from(prior.responseCiphertext), 'lot-duplicate'),
          ),
        );
    }
  }

  private async duplicateOnce(actorId: string, id: string, input: unknown) {
    const { idempotencyKey } = z
      .object({ idempotencyKey: z.uuid() })
      .strict()
      .parse(input);
    return this.db.$transaction(async (tx) => {
      await this.access(tx, actorId, 'inventory.write');
      const hash = createHash('sha256').update(`duplicate:${id}`).digest('hex');
      const replay = await this.replay(
        tx,
        'lot-duplicate',
        actorId,
        idempotencyKey,
        hash,
      );
      if (replay) return z.object({ id: z.uuid() }).parse(replay);
      const source = await tx.lot.findUnique({
        where: { id },
        include: { settlement: true, images: true },
      });
      if (!source || source.deletedAt)
        throw new NotFoundException('Lot not found.');
      const copy = duplicateLotFields({
        ...source,
        runTimeMinutes: runMinutes(source),
        details: source.details ?? {},
      });
      const now = new Date();
      const row = await tx.lot.create({
        data: {
          ...copy,
          details: copy.details as Prisma.InputJsonValue,
          status: 'draft',
          createdById: actorId,
          startAt: now,
          endAt: new Date(now.getTime() + copy.runTimeMinutes * 60_000),
        },
      });
      await audit(tx, actorId, 'lots.duplicated', row.id, null, {
        from: source.lotNumber,
      });
      await audit(tx, actorId, 'lots.duplicate_created', id, null, {
        copy: row.lotNumber,
      });
      const result = { id: row.id };
      await this.remember(
        tx,
        'lot-duplicate',
        actorId,
        idempotencyKey,
        hash,
        result,
      );
      return result;
    });
  }

  /**
   * Show a finished draft in Upcoming as "Coming soon, date to be announced"
   * (owner decision 2026-11-14). It stays a draft, so pre-bids, bids and Buy
   * Now still refuse it; buyers can only view and watch it. Scheduling it
   * later uses the normal scheduling step.
   */
  async setComingSoon(actorId: string, id: string, input: unknown) {
    const v = lotComingSoonInputSchema.parse(input);
    const hash = createHash('sha256')
      .update(`coming-soon:${id}:${v.comingSoon}:${v.expectedUpdatedAt}`)
      .digest('hex');
    return this.db.$transaction(async (tx) => {
      await this.access(tx, actorId, 'auctions.manage');
      const replayed = await this.replay(
        tx,
        'lots-coming-soon',
        actorId,
        v.idempotencyKey,
        hash,
      );
      if (replayed) return lotEditorSchema.parse(replayed);
      const lot = await this.lockLot(tx, id);
      if (lot.deletedAt) throw new NotFoundException('Lot not found.');
      if (lot.updatedAt.toISOString() !== v.expectedUpdatedAt)
        throw conflict('This lot changed. Reload it first.');
      if (lot.archivedAt)
        throw conflict('Restore this lot before showing it to buyers.');
      const { stage } = await this.state(tx, lot);
      if (stage !== 'draft')
        throw conflict(
          'Only drafts can be Coming soon. This lot is already scheduled, live or ended.',
        );
      // Buyers will see it, so it must meet the same rules as publishing.
      if (v.comingSoon) {
        const problems = await publishProblems(tx, id);
        if (problems.length) throw fieldError('form', problems.join(' '), 400);
      }
      const before = lot.comingSoonAt !== null;
      let current = lot;
      if (before !== v.comingSoon) {
        await tx.lot.update({
          where: { id },
          data: {
            comingSoonAt: v.comingSoon ? new Date() : null,
            updatedAt: new Date(
              Math.max(Date.now(), lot.updatedAt.getTime() + 1),
            ),
          },
        });
        await audit(
          tx,
          actorId,
          'lots.coming_soon_updated',
          id,
          { comingSoon: before },
          { comingSoon: v.comingSoon, lotNumber: lot.lotNumber },
        );
        current = await this.lockLot(tx, id);
      }
      const { editor } = await this.editorOf(tx, current);
      await this.remember(
        tx,
        'lots-coming-soon',
        actorId,
        v.idempotencyKey,
        hash,
        editor,
      );
      return editor;
    });
  }

  async archive(
    actorId: string,
    id: string,
    input: unknown,
    archived: boolean,
  ) {
    const v = lotVersionSchema.parse(input);
    return this.db.$transaction(async (tx) => {
      await this.access(tx, actorId, 'records.archive');
      const lot = await this.lockLot(tx, id);
      if (lot.deletedAt) throw new NotFoundException('Lot not found.');
      if (lot.updatedAt.toISOString() !== v.expectedUpdatedAt)
        throw conflict('This lot changed. Reload it first.');
      const { stage } = await this.state(tx, lot);
      if (archived && !['draft', 'sold', 'unsold', 'cancelled'].includes(stage))
        throw conflict(
          'Only drafts and ended lots can be archived. Cancel live or scheduled lots first.',
        );
      if (archived === !!lot.archivedAt)
        throw conflict(archived ? 'Already archived.' : 'Not archived.');
      await tx.lot.update({
        where: { id },
        data: {
          archivedAt: archived ? new Date() : null,
          updatedAt: new Date(
            Math.max(Date.now(), lot.updatedAt.getTime() + 1),
          ),
        },
      });
      await audit(
        tx,
        actorId,
        archived ? 'lots.archived' : 'lots.unarchived',
        id,
        null,
        {
          lotNumber: lot.lotNumber,
        },
      );
      return {
        id,
        message: `${lot.lotNumber} ${archived ? 'archived' : 'is back in the list'}.`,
      };
    });
  }

  private async deleteOne(
    tx: Tx,
    access: Access,
    id: string,
    reason: string,
    freeBin: boolean,
    expectedUpdatedAt?: string,
  ) {
    const lot = await this.lockLot(tx, id);
    if (expectedUpdatedAt && lot.updatedAt.toISOString() !== expectedUpdatedAt)
      throw conflict('This lot changed. Reload it first.');
    const { stage, hasBids } = await this.state(tx, lot);
    const rule = lotDeleteRule({
      stage,
      hasBids,
      deleted: !!lot.deletedAt,
      canDeleteAny: access.permissions.includes('lots.delete'),
      canDeleteOwnDrafts: access.permissions.includes('inventory.write'),
      isCreator: lot.createdById === access.user.id,
    });
    if (!rule.allowed)
      return {
        ok: false as const,
        lot,
        reason: rule.reason,
        block: rule.block,
      };
    await tx.lot.update({
      where: { id },
      data: {
        status: rule.cancelsSchedule ? 'cancelled' : lot.status,
        ...(rule.cancelsSchedule ? { scheduleVersion: { increment: 1 } } : {}),
        deletedAt: new Date(),
        deleteReason: reason,
        deletedById: access.user.id,
        ...(freeBin ? { binId: null } : {}),
        updatedAt: new Date(Math.max(Date.now(), lot.updatedAt.getTime() + 1)),
      },
    });
    if (rule.cancelsSchedule)
      await audit(tx, access.user.id, 'lots.upcoming_cancelled', id, null, {
        reason: 'deleted',
      });
    await audit(
      tx,
      access.user.id,
      'lots.deleted',
      id,
      { status: lot.status, binId: lot.binId },
      {
        reason,
        freeBin,
      },
    );
    return { ok: true as const, lot };
  }

  async remove(actorId: string, id: string, input: unknown) {
    const v = lotDeleteSchema.parse(input);
    return this.db.$transaction(async (tx) => {
      const access = await this.access(tx, actorId, 'inventory.read');
      const result = await this.deleteOne(
        tx,
        access,
        id,
        v.reason,
        v.freeBin,
        v.expectedUpdatedAt,
      );
      if (!result.ok)
        throw fieldError(
          `delete.${result.block.replace('-', '')}`,
          result.reason,
          409,
        );
      return {
        id,
        message: `${result.lot.lotNumber} moved to Deleted. An admin can restore it for ${LOT_RESTORE_DAYS} days.`,
      };
    });
  }

  async restore(actorId: string, id: string, input: unknown) {
    const v = lotVersionSchema.parse(input);
    return this.db.$transaction(async (tx) => {
      await this.access(tx, actorId, 'records.purge');
      const lot = await this.lockLot(tx, id);
      if (!lot.deletedAt) throw conflict('This lot isn’t deleted.');
      if (lot.updatedAt.toISOString() !== v.expectedUpdatedAt)
        throw conflict('This lot changed. Reload it first.');
      if (await tx.bid.count({ where: { lotId: id } }))
        throw conflict(
          'This lot has bid history, so it can’t come back as a draft. Duplicate it instead.',
        );
      if (Date.now() - lot.deletedAt.getTime() > LOT_RESTORE_DAYS * 86_400_000)
        throw conflict(
          `Lots can be restored for ${LOT_RESTORE_DAYS} days after they’re deleted.`,
        );
      // A deleted scheduled lot had its schedule cancelled; it comes back as
      // a draft to schedule again.
      await tx.lot.update({
        where: { id },
        data: {
          status: 'draft',
          deletedAt: null,
          deleteReason: null,
          deletedById: null,
          updatedAt: new Date(
            Math.max(Date.now(), lot.updatedAt.getTime() + 1),
          ),
        },
      });
      await audit(
        tx,
        actorId,
        'lots.restored',
        id,
        { status: lot.status },
        { status: 'draft' },
      );
      return { id, message: `${lot.lotNumber} restored as a draft.` };
    });
  }

  // ------------------------------------------------------------- bulk ----

  async bulk(actorId: string, input: unknown) {
    const v = lotBulkSchema.parse(input);
    const hash = createHash('sha256')
      .update(JSON.stringify({ ...v, idempotencyKey: undefined }))
      .digest('hex');
    const prior = await this.db.$transaction((tx) =>
      this.replay(tx, 'lots-bulk', actorId, v.idempotencyKey, hash),
    );
    if (prior) return lotBulkResultSchema.parse(prior);
    if ((v.action === 'edit' || v.action === 'move') && !v.changes)
      throw new BadRequestException('Choose what to change.');
    if (
      (v.action === 'archive' || v.action === 'delete') &&
      !v.reason &&
      v.action === 'delete'
    )
      throw fieldError('reason', 'Give a reason for deleting these lots.', 400);
    const permission =
      v.action === 'archive'
        ? 'records.archive'
        : v.action === 'delete'
          ? 'inventory.read'
          : 'inventory.write';
    let done = 0;
    const skipped: { id: string; lotNumber: string; reason: string }[] = [];
    // Each lot in its own transaction: one locked lot never blocks the rest.
    for (const id of [...new Set(v.ids)]) {
      try {
        const outcome = await this.db.$transaction(async (tx) => {
          const access = await this.access(tx, actorId, permission);
          if (v.action === 'delete') {
            const r = await this.deleteOne(
              tx,
              access,
              id,
              v.reason ?? 'Bulk delete',
              false,
            );
            return r.ok
              ? null
              : { lotNumber: r.lot.lotNumber, reason: r.reason };
          }
          const lot = await this.lockLot(tx, id);
          if (lot.deletedAt)
            return { lotNumber: lot.lotNumber, reason: 'It’s deleted.' };
          const { stage, hasBids } = await this.state(tx, lot);
          if (v.action === 'archive') {
            if (lot.archivedAt)
              return { lotNumber: lot.lotNumber, reason: 'Already archived.' };
            if (!['draft', 'sold', 'unsold', 'cancelled'].includes(stage))
              return {
                lotNumber: lot.lotNumber,
                reason: 'Live and scheduled lots can’t be archived.',
              };
            await tx.lot.update({
              where: { id },
              data: {
                archivedAt: new Date(),
                updatedAt: new Date(
                  Math.max(Date.now(), lot.updatedAt.getTime() + 1),
                ),
              },
            });
            await audit(tx, actorId, 'lots.archived', id, null, {
              bulk: true,
              reason: v.reason ?? null,
            });
            return null;
          }
          const locks = lotEditLocks({ stage, hasBids });
          const c = v.changes ?? {};
          if (!locks.editable || lot.archivedAt)
            return {
              lotNumber: lot.lotNumber,
              reason: 'It has ended or is archived.',
            };
          if (
            (c.startPriceKobo !== undefined && locks.priceLocked) ||
            (c.runTimeMinutes !== undefined && locks.runTimeLocked)
          )
            return {
              lotNumber: lot.lotNumber,
              reason: 'Price and run time are locked (live or has bids).',
            };
          if (c.categoryId && locks.categoryLocked)
            return {
              lotNumber: lot.lotNumber,
              reason: 'Category is locked once a lot is live.',
            };
          if (c.locationId && locks.locationLocked)
            return {
              lotNumber: lot.lotNumber,
              reason: 'Pickup location is locked once a lot is live.',
            };
          const next: LotForm = {
            ...formOf(lot),
            ...(c.categoryId ? { categoryId: c.categoryId } : {}),
            ...(c.condition ? { condition: c.condition } : {}),
            ...(c.startPriceKobo ? { startPriceKobo: c.startPriceKobo } : {}),
            ...(c.runTimeMinutes ? { runTimeMinutes: c.runTimeMinutes } : {}),
            ...(c.locationId && c.locationId !== lot.locationId
              ? { locationId: c.locationId, binId: null }
              : {}),
          };
          await this.checkReferences(tx, next, lot.binId);
          await tx.lot.update({
            where: { id },
            data: {
              ...this.data(next),
              ...(stage === 'draft'
                ? {
                    endAt: new Date(
                      lot.startAt.getTime() + next.runTimeMinutes * 60_000,
                    ),
                  }
                : {}),
              updatedAt: new Date(
                Math.max(Date.now(), lot.updatedAt.getTime() + 1),
              ),
            },
          });
          await audit(
            tx,
            actorId,
            v.action === 'move' ? 'lots.moved' : 'lots.bulk_edited',
            id,
            formOf(lot),
            next,
          );
          return null;
        });
        if (outcome) skipped.push({ id, ...outcome });
        else done += 1;
      } catch (error) {
        if (error instanceof ForbiddenException) throw error;
        const reason =
          error instanceof NotFoundException
            ? 'Not found.'
            : error instanceof Error && 'response' in error
              ? String(
                  (error as { response?: { message?: string } }).response
                    ?.message ?? 'Couldn’t be changed.',
                )
              : 'Couldn’t be changed. Try again.';
        const lot = await this.db.lot.findUnique({
          where: { id },
          select: { lotNumber: true },
        });
        skipped.push({
          id,
          lotNumber: lot?.lotNumber ?? id.slice(0, 8),
          reason,
        });
      }
    }
    const result = lotBulkResultSchema.parse({ done, skipped });
    await this.rememberOnce(
      'lots-bulk',
      actorId,
      v.idempotencyKey,
      hash,
      result,
    );
    return result;
  }

  // --------------------------------------------------------------- CSV ----

  private async csvContext(tx: Tx, categoryId: string) {
    const category = await tx.category.findFirst({
      where: { id: categoryId, archivedAt: null },
    });
    if (!category)
      throw fieldError('categoryId', 'Pick a category from Lot setup.', 400);
    const rules = await effectiveCategory(tx, category);
    const [locations, bins, suppliers, brands] = await inOrder(
      () =>
        tx.location.findMany({
          where: { archivedAt: null },
          select: { id: true, code: true },
        }),
      () =>
        tx.bin.findMany({
          where: { deletedAt: null },
          select: { id: true, code: true, locationId: true },
          take: 20_000,
        }),
      () =>
        tx.supplier.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true },
          take: 5_000,
        }),
      () =>
        tx.brand.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true },
          take: 5_000,
        }),
    );
    const fields: LotCsvField[] = rules.fields.map((f) => ({
      key: f.key,
      name: f.name,
      type: f.type as LotCsvField['type'],
      required: f.required,
      options: f.options,
    }));
    return {
      category,
      ctx: {
        categoryId,
        fields,
        allowedConditions: rules.conditions,
        locations: new Map(locations.map((l) => [l.code.toUpperCase(), l.id])),
        bins: new Map(
          bins.map((b) => [`${b.locationId}:${b.code.toUpperCase()}`, b.id]),
        ),
        suppliers: new Map(suppliers.map((s) => [s.name.toLowerCase(), s.id])),
        brands: new Map(brands.map((b) => [b.name.toLowerCase(), b.id])),
      },
    };
  }

  async csvTemplate(actorId: string, categoryId: string) {
    return this.db.$transaction(async (tx) => {
      await this.access(tx, actorId, 'inventory.write');
      const { category, ctx } = await this.csvContext(tx, categoryId);
      const header = lotCsvHeaders(ctx.fields);
      const example = header.map((h) =>
        h === 'title'
          ? 'Tecno Camon 30, 256GB'
          : h === 'description'
            ? 'Returned unused. Powers on and was reset.'
            : h === 'condition'
              ? 'Open box'
              : h === 'start_price'
                ? '5000'
                : h === 'retail_price'
                  ? '215000'
                  : h === 'run_time_hours'
                    ? '24'
                    : h === 'pickup_location_code'
                      ? ([...ctx.locations.keys()][0] ?? 'IKJ')
                      : h === 'included'
                        ? 'Phone|Charger'
                        : '',
      );
      const cell = (v: string) =>
        /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
      return {
        filename: `lots-template-${category.slug}.csv`,
        csv: `${BOM}${header.join(',')}\n${example.map(cell).join(',')}\n`,
      };
    });
  }

  async csvCheck(actorId: string, input: unknown) {
    const v = z
      .object({ categoryId: z.uuid(), csv: z.string().max(4_100_000) })
      .strict()
      .parse(input);
    return this.db.$transaction(async (tx) => {
      await this.access(tx, actorId, 'inventory.write');
      const { ctx } = await this.csvContext(tx, v.categoryId);
      try {
        const result = validateLotCsv(v.csv, ctx);
        return {
          rows: result.rows,
          good: result.good.length,
          problems: result.problems.slice(0, 500),
        };
      } catch (error) {
        throw fieldError(
          'csv',
          error instanceof Error ? error.message : 'The file can’t be read.',
          400,
        );
      }
    });
  }

  async csvImport(actorId: string, input: unknown) {
    const v = z
      .object({
        categoryId: z.uuid(),
        csv: z.string().max(4_100_000),
        idempotencyKey: z.uuid(),
      })
      .strict()
      .parse(input);
    const hash = createHash('sha256')
      .update(v.categoryId + '\n' + v.csv)
      .digest('hex');
    const prior = await this.db.$transaction(async (tx) => {
      await this.access(tx, actorId, 'inventory.write');
      return this.replay(tx, 'lots-import', actorId, v.idempotencyKey, hash);
    });
    if (prior)
      return z
        .object({
          imported: z.number(),
          problems: z.number(),
          ids: z.array(z.uuid()),
        })
        .parse(prior);
    const { good, problems } = await this.db.$transaction(async (tx) => {
      const { ctx } = await this.csvContext(tx, v.categoryId);
      try {
        return validateLotCsv(v.csv, ctx);
      } catch (error) {
        throw fieldError(
          'csv',
          error instanceof Error ? error.message : 'The file can’t be read.',
          400,
        );
      }
    });
    // Each row's lot ID comes from the request key and row number, so a
    // retry (or a double submit) after a partial failure only creates the
    // lots that are still missing.
    const rowId = (row: number) => {
      const h = createHash('sha256')
        .update(`${actorId}:${v.idempotencyKey}:${row}`)
        .digest('hex');
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h.slice(16, 17), 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
    };
    const ids: string[] = [];
    for (let i = 0; i < good.length; i += 100) {
      const chunk = good.slice(i, i + 100);
      await this.db.$transaction(
        async (tx) => {
          await this.access(tx, actorId, 'inventory.write');
          const wanted = chunk.map(({ row }) => rowId(row));
          const existing = new Set(
            (
              await tx.lot.findMany({
                where: { id: { in: wanted } },
                select: { id: true },
              })
            ).map((l) => l.id),
          );
          for (const { lot, row } of chunk) {
            const id = rowId(row);
            if (existing.has(id)) continue;
            const now = new Date();
            await tx.lot.create({
              data: {
                id,
                ...this.data(lot),
                status: 'draft',
                createdById: actorId,
                startAt: now,
                endAt: new Date(now.getTime() + lot.runTimeMinutes * 60_000),
              },
            });
            await audit(tx, actorId, 'lots.imported', id, null, {
              row,
              key: v.idempotencyKey,
            });
          }
        },
        { maxWait: 15000, timeout: 60000 },
      );
      ids.push(...chunk.map(({ row }) => rowId(row)));
    }
    const result = { imported: ids.length, problems: problems.length, ids };
    await this.rememberOnce(
      'lots-import',
      actorId,
      v.idempotencyKey,
      hash,
      result,
    );
    return result;
  }

  async exportCsv(actorId: string, input: unknown) {
    const base = lotListQuerySchema.parse({
      ...(input as object),
      limit: 50,
      cursor: undefined,
    });
    const lines: string[] = [];
    let cursor: string | undefined;
    let total = 0;
    do {
      const page = await this.list(actorId, {
        ...base,
        conditions: base.conditions?.join(','),
        categoryIds: base.categoryIds?.join(','),
        locationIds: base.locationIds?.join(','),
        supplierIds: base.supplierIds?.join(','),
        addedByIds: base.addedByIds?.join(','),
        cursor,
      });
      total = page.total;
      if (total > LOT_EXPORT_MAX_ROWS)
        throw new BadRequestException(
          `This list has ${total.toLocaleString('en-NG')} lots. Narrow the filters to ${LOT_EXPORT_MAX_ROWS.toLocaleString('en-NG')} or fewer to export.`,
        );
      for (const r of page.items)
        lines.push(
          [
            r.lotNumber,
            r.title,
            r.categoryName,
            r.condition,
            r.stage,
            r.locationName,
            r.binCode ?? '',
            (r.startPriceKobo / 100).toFixed(2),
            r.currentPriceKobo === null
              ? ''
              : (r.currentPriceKobo / 100).toFixed(2),
            (r.retailPriceKobo / 100).toFixed(2),
            String(r.bids),
            String(r.watching),
            r.startsAt,
            r.endsAt,
            r.addedBy?.name ?? '',
            r.createdAt,
          ]
            .map((v) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v))
            .join(','),
        );
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    await this.db.$transaction(async (tx) => {
      await audit(tx, actorId, 'lots.exported', randomUUID(), null, {
        rows: lines.length,
        tab: base.tab,
      });
    });
    const header =
      'Lot ID,Title,Category,Condition,Status,Pickup location,Bin,Start price (NGN),Current or winning price (NGN),Retail price (NGN),Bids,Watching,Starts (UTC),Ends (UTC),Added by,Added (UTC)';
    return {
      filename: `lots-${new Date().toISOString().slice(0, 10)}.csv`,
      csv: `${BOM}${header}\n${lines.join('\n')}\n`,
      rows: lines.length,
    };
  }

  async labels(actorId: string, input: unknown) {
    const { ids } = z
      .object({ ids: z.array(z.uuid()).min(1).max(200) })
      .strict()
      .parse(input);
    return this.db.$transaction(async (tx) => {
      await this.access(tx, actorId, 'inventory.read');
      const lots = await tx.lot.findMany({
        where: { id: { in: ids }, deletedAt: null },
        include: { bin: true, location: true },
      });
      const byId = new Map(lots.map((l) => [l.id, l]));
      return lotLabelSchema.parse({
        items: ids.flatMap((id) => {
          const l = byId.get(id);
          return l
            ? [
                {
                  id: l.id,
                  lotNumber: l.lotNumber,
                  title: l.title,
                  binCode: l.bin?.code ?? null,
                  locationCode: l.location.code,
                },
              ]
            : [];
        }),
      });
    });
  }

  // ------------------------------------------------------- idempotency ----

  private async replay(
    tx: Tx,
    scope: string,
    actorId: string,
    key: string,
    hash: string,
  ) {
    const prior = await tx.idempotencyKey.findUnique({
      where: { scope_key: { scope, key: `${actorId}:${key}` } },
    });
    if (!prior) return null;
    if (prior.requestHash !== hash || !prior.responseCiphertext)
      throw conflict('This request key belongs to another change.');
    return JSON.parse(
      decryptPii(Buffer.from(prior.responseCiphertext), scope),
    ) as unknown;
  }

  /** Store a result outside the work's transaction; a twin request may
   * already have stored the same one. */
  private async rememberOnce(
    scope: string,
    actorId: string,
    key: string,
    hash: string,
    result: unknown,
  ) {
    try {
      await this.db.$transaction((tx) =>
        this.remember(tx, scope, actorId, key, hash, result),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }

  private async remember(
    tx: Tx,
    scope: string,
    actorId: string,
    key: string,
    hash: string,
    result: unknown,
  ) {
    await tx.idempotencyKey.create({
      data: {
        userId: actorId,
        scope,
        key: `${actorId}:${key}`,
        requestHash: hash,
        status: 'completed',
        responseCiphertext: encryptPii(JSON.stringify(result), scope),
      },
    });
  }
}
