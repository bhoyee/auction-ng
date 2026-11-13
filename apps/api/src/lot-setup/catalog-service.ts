import { BadRequestException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import {
  activeToggleSchema,
  brandMergeSchema,
  brandPageSchema,
  brandSaveSchema,
  canDeleteBrand,
  canDeleteSupplier,
  conditionListSchema,
  conditionOrderSchema,
  conditionSaveSchema,
  lotSetupDeleteSchema,
  lotSetupListSchema,
  lotSetupOptionsSchema,
  lotSetupSummarySchema,
  supplierPageSchema,
  supplierSaveSchema,
  lotSetupDeletedKinds,
  lotSetupDeletionListSchema,
  lotSetupDeletionPageSchema,
  binIsFull,
} from '@auction-ng/shared';
import { Prisma } from '../generated/prisma/client';
import { decryptPii } from '../security/pii';
import type { AuthIdentity } from '../auth/auth-service';
import {
  LotSetupBase,
  blocked,
  assertFresh,
  nextUpdatedAt,
  parseInput,
  type Tx,
} from './lot-setup-base';
import type { CategoryService } from './category-service';
import { CURRENT_LOT } from './location-service';

const cursorSchema = z.object({ name: z.string(), id: z.uuid() }).strict();
function readCursor(cursor?: string) {
  if (!cursor) return undefined;
  try {
    return cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString()),
    );
  } catch {
    throw new BadRequestException('Reload the list and try again.');
  }
}
const writeCursor = (row?: { name: string; id: string }) =>
  row
    ? Buffer.from(JSON.stringify({ name: row.name, id: row.id })).toString(
        'base64url',
      )
    : null;
// Keyset pagination by (name, id) with optional case-insensitive search.
const pageWhere = (search?: string, after?: z.infer<typeof cursorSchema>) => ({
  ...(search
    ? { name: { contains: search, mode: 'insensitive' as const } }
    : {}),
  ...(after
    ? {
        OR: [
          { name: { gt: after.name } },
          { name: after.name, id: { gt: after.id } },
        ],
      }
    : {}),
});

export class CatalogService extends LotSetupBase {
  constructor(
    staff: ConstructorParameters<typeof LotSetupBase>[0],
    private readonly categories: CategoryService,
  ) {
    super(staff);
  }

  async summary(who: AuthIdentity) {
    return this.db.$transaction(async (tx) => {
      const { canManage } = await this.reader(tx, who);
      const [categories, locations, conditions, suppliers, brands] =
        await Promise.all([
          tx.category.count({ where: { archivedAt: null } }),
          tx.location.count({ where: { archivedAt: null } }),
          tx.condition.count(),
          tx.supplier.count(),
          tx.brand.count(),
        ]);
      return lotSetupSummarySchema.parse({
        categories,
        locations,
        conditions,
        suppliers,
        brands,
        canManage,
      });
    });
  }

  // ---- Conditions ---------------------------------------------------------
  async conditions(who: AuthIdentity) {
    return this.db.$transaction(async (tx) => {
      const { canManage } = await this.reader(tx, who);
      const rows = await tx.condition.findMany({
        orderBy: { sortOrder: 'asc' },
      });
      const counts = await tx.$queryRaw<{ condition: string; n: bigint }[]>`
        SELECT condition, count(*) AS n FROM lots WHERE archived_at IS NULL GROUP BY condition`;
      return conditionListSchema.parse({
        canManage,
        items: rows.map((r) => ({
          id: r.id,
          key: r.key,
          label: r.label,
          meaning: r.meaning,
          colour: r.colour,
          sortOrder: r.sortOrder,
          active: r.active,
          lots: Number(counts.find((c) => c.condition === r.key)?.n ?? 0),
          updatedAt: r.updatedAt.toISOString(),
        })),
      });
    });
  }

  async saveCondition(who: AuthIdentity, input: unknown) {
    const v = parseInput(conditionSaveSchema, input);
    return this.change(who, v, 'condition', 'updated', async (tx) => {
      await tx.$queryRaw`SELECT id FROM conditions WHERE id=${v.id}::uuid FOR UPDATE`;
      const before = await tx.condition.findUnique({ where: { id: v.id } });
      if (!before) throw new NotFoundException();
      assertFresh(before.updatedAt, v.expectedUpdatedAt, 'condition');
      if (
        !v.active &&
        (await tx.condition.count({ where: { active: true } })) <= 1 &&
        before.active
      )
        throw blocked('Keep at least one condition switched on.');
      const after = await tx.condition.update({
        where: { id: v.id },
        data: {
          label: v.label,
          meaning: v.meaning,
          colour: v.colour,
          active: v.active,
          updatedAt: nextUpdatedAt(before.updatedAt),
        },
      });
      return {
        result: { id: v.id, message: `${after.label} saved.` },
        before,
        after,
      };
    });
  }

  async orderConditions(who: AuthIdentity, input: unknown) {
    const v = parseInput(conditionOrderSchema, input);
    return this.change(who, v, 'condition', 'reordered', async (tx) => {
      const rows = await tx.condition.findMany({
        select: { id: true, sortOrder: true },
      });
      if (
        rows.length !== v.ids.length ||
        rows.some((r) => !v.ids.includes(r.id))
      )
        throw blocked('The list changed. Reload and try again.');
      for (const [index, id] of v.ids.entries())
        await tx.condition.update({
          where: { id },
          data: { sortOrder: index + 1, updatedAt: new Date() },
        });
      return {
        result: { id: v.ids[0] ?? '', message: 'New order saved.' },
        before: rows,
        after: v.ids,
      };
    });
  }

  // ---- Suppliers ----------------------------------------------------------
  async suppliers(who: AuthIdentity, input: unknown) {
    const q = parseInput(lotSetupListSchema, input);
    return this.db.$transaction(async (tx) => {
      const { canManage } = await this.reader(tx, who);
      const rows = await tx.supplier.findMany({
        where: pageWhere(q.search, readCursor(q.cursor)),
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: q.limit + 1,
      });
      const page = rows.slice(0, q.limit);
      return supplierPageSchema.parse({
        canManage,
        // Inventory batches are not built yet (T15e), so batches and spend
        // are zero and every supplier can still be deleted.
        items: page.map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          contactName: r.contactName,
          phone: r.phone,
          email: r.email,
          paymentTerms: r.paymentTerms,
          notes: r.notes,
          active: r.active,
          batches: 0,
          totalSpentKobo: 0,
          updatedAt: r.updatedAt.toISOString(),
          deleteCheck: canDeleteSupplier({ batches: 0 }),
        })),
        nextCursor: rows.length > q.limit ? writeCursor(page.at(-1)) : null,
      });
    });
  }

  // Who permanently deleted which setup item, newest first. Names come from
  // the encrypted "before" copy each delete stores in the audit log.
  async deletions(who: AuthIdentity, input: unknown) {
    const q = parseInput(lotSetupDeletionListSchema, input);
    const cursor = deletionCursor.read(q.cursor);
    return this.db.$transaction(async (tx) => {
      await this.reader(tx, who);
      const rows = await tx.auditLog.findMany({
        where: {
          action: {
            in: lotSetupDeletedKinds.map((kind) => `lot_setup.${kind}.deleted`),
          },
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: cursor.at } },
                  { createdAt: cursor.at, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: q.limit + 1,
        include: { actor: { select: { name: true } } },
      });
      const page = rows.slice(0, q.limit);
      return lotSetupDeletionPageSchema.parse({
        items: page.map((row) => {
          const kind = z.enum(lotSetupDeletedKinds).parse(row.entityType);
          const before = deletedSnapshot(row.beforeCiphertext);
          return {
            id: row.id,
            kind,
            itemId: row.entityId,
            name:
              (kind === 'bin' ? before.code : before.name) ??
              'Name not recorded',
            deletedBy: row.actor?.name ?? 'System',
            deletedAt: row.createdAt.toISOString(),
          };
        }),
        nextCursor:
          rows.length > q.limit && page.at(-1)
            ? deletionCursor.write(page.at(-1))
            : null,
      });
    });
  }

  async saveSupplier(who: AuthIdentity, input: unknown) {
    const v = parseInput(supplierSaveSchema, input);
    return this.change(
      who,
      v,
      'supplier',
      v.id ? 'updated' : 'created',
      async (tx) => {
        let before = null;
        if (v.id) {
          await tx.$queryRaw`SELECT id FROM suppliers WHERE id=${v.id}::uuid FOR UPDATE`;
          before = await tx.supplier.findUnique({ where: { id: v.id } });
          if (!before) throw new NotFoundException();
          assertFresh(before.updatedAt, v.expectedUpdatedAt, 'supplier');
        }
        const data = {
          name: v.name,
          type: v.type,
          contactName: v.contactName,
          phone: v.phone,
          email: v.email,
          paymentTerms: v.paymentTerms,
          notes: v.notes,
          updatedAt: nextUpdatedAt(before?.updatedAt),
        };
        const after = v.id
          ? await tx.supplier.update({ where: { id: v.id }, data })
          : await tx.supplier.create({ data });
        return {
          result: { id: after.id, message: `${after.name} saved.` },
          before,
          after,
        };
      },
    );
  }

  async supplierActive(who: AuthIdentity, input: unknown) {
    const v = parseInput(activeToggleSchema, input);
    return this.change(
      who,
      v,
      'supplier',
      v.active ? 'activated' : 'deactivated',
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM suppliers WHERE id=${v.id}::uuid FOR UPDATE`;
        const before = await tx.supplier.findUnique({ where: { id: v.id } });
        if (!before) throw new NotFoundException();
        assertFresh(before.updatedAt, v.expectedUpdatedAt, 'supplier');
        const after = await tx.supplier.update({
          where: { id: v.id },
          data: {
            active: v.active,
            updatedAt: nextUpdatedAt(before.updatedAt),
          },
        });
        return {
          result: {
            id: v.id,
            message: v.active
              ? `${after.name} is active again.`
              : `${after.name} is deactivated. It can't be picked for new batches.`,
          },
          before,
          after,
        };
      },
    );
  }

  async removeSupplier(who: AuthIdentity, input: unknown) {
    const v = parseInput(lotSetupDeleteSchema, input);
    return this.change(who, v, 'supplier', 'deleted', async (tx) => {
      await tx.$queryRaw`SELECT id FROM suppliers WHERE id=${v.id}::uuid FOR UPDATE`;
      const before = await tx.supplier.findUnique({ where: { id: v.id } });
      if (!before) throw new NotFoundException();
      assertFresh(before.updatedAt, v.expectedUpdatedAt, 'supplier');
      const check = canDeleteSupplier({ batches: 0 });
      if (!check.allowed) throw blocked(check.reason);
      await tx.supplier.delete({ where: { id: v.id } });
      return {
        result: { id: v.id, message: `${before.name} deleted.` },
        before,
        after: null,
      };
    });
  }

  // ---- Brands -------------------------------------------------------------
  async brands(who: AuthIdentity, input: unknown) {
    const q = parseInput(lotSetupListSchema, input);
    return this.db.$transaction(async (tx) => {
      const { canManage } = await this.reader(tx, who);
      const rows = await tx.brand.findMany({
        where: pageWhere(q.search, readCursor(q.cursor)),
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: q.limit + 1,
        include: {
          categories: {
            include: { category: { select: { id: true, name: true } } },
          },
        },
      });
      const page = rows.slice(0, q.limit);
      const counts = page.length
        ? await tx.$queryRaw<{ id: string; n: bigint }[]>`
            SELECT brand_id::text AS id, count(*) AS n FROM lots
            WHERE brand_id IN (${Prisma.join(page.map((b) => Prisma.sql`${b.id}::uuid`))})
            GROUP BY brand_id`
        : [];
      return brandPageSchema.parse({
        canManage,
        items: page.map((b) => {
          const lots = Number(counts.find((c) => c.id === b.id)?.n ?? 0);
          return {
            id: b.id,
            name: b.name,
            categories: b.categories
              .map((c) => c.category)
              .sort((x, y) => x.name.localeCompare(y.name)),
            lots,
            updatedAt: b.updatedAt.toISOString(),
            deleteCheck: canDeleteBrand({ lots }),
          };
        }),
        nextCursor: rows.length > q.limit ? writeCursor(page.at(-1)) : null,
      });
    });
  }

  private async brandSnapshot(tx: Tx, id: string) {
    const row = await tx.brand.findUnique({
      where: { id },
      include: { categories: { select: { categoryId: true } } },
    });
    return row
      ? { ...row, categories: row.categories.map((c) => c.categoryId) }
      : null;
  }

  async saveBrand(who: AuthIdentity, input: unknown) {
    const v = parseInput(brandSaveSchema, input);
    return this.change(
      who,
      v,
      'brand',
      v.id ? 'updated' : 'created',
      async (tx) => {
        let before: Awaited<ReturnType<CatalogService['brandSnapshot']>> = null;
        if (v.id) {
          await tx.$queryRaw`SELECT id FROM brands WHERE id=${v.id}::uuid FOR UPDATE`;
          before = await this.brandSnapshot(tx, v.id);
          if (!before) throw new NotFoundException();
          assertFresh(before.updatedAt, v.expectedUpdatedAt, 'brand');
        }
        const categories = await tx.category.count({
          where: { id: { in: v.categoryIds }, archivedAt: null },
        });
        if (categories !== new Set(v.categoryIds).size)
          throw new BadRequestException('Pick active categories only.');
        const data = {
          name: v.name,
          updatedAt: nextUpdatedAt(before?.updatedAt),
        };
        const row = v.id
          ? await tx.brand.update({ where: { id: v.id }, data })
          : await tx.brand.create({ data });
        await tx.brandCategory.deleteMany({ where: { brandId: row.id } });
        await tx.brandCategory.createMany({
          data: [...new Set(v.categoryIds)].map((categoryId) => ({
            brandId: row.id,
            categoryId,
          })),
        });
        return {
          result: { id: row.id, message: `${row.name} saved.` },
          before,
          after: await this.brandSnapshot(tx, row.id),
        };
      },
    );
  }

  async mergeBrands(who: AuthIdentity, input: unknown) {
    const v = parseInput(brandMergeSchema, input);
    return this.change(who, v, 'brand', 'merged', async (tx) => {
      await tx.$queryRaw`SELECT id FROM brands WHERE id IN (${v.sourceId}::uuid, ${v.targetId}::uuid) ORDER BY id FOR UPDATE`;
      const [source, target] = await Promise.all([
        this.brandSnapshot(tx, v.sourceId),
        this.brandSnapshot(tx, v.targetId),
      ]);
      if (!source || !target) throw new NotFoundException();
      const moved = await tx.lot.updateMany({
        where: { brandId: v.sourceId },
        data: { brandId: v.targetId },
      });
      await tx.brandCategory.createMany({
        data: source.categories.map((categoryId) => ({
          brandId: v.targetId,
          categoryId,
        })),
        skipDuplicates: true,
      });
      await tx.brand.delete({ where: { id: v.sourceId } });
      await tx.brand.update({
        where: { id: v.targetId },
        data: { updatedAt: nextUpdatedAt(target.updatedAt) },
      });
      return {
        result: {
          id: v.targetId,
          message: `Merged ${source.name} into ${target.name}. ${moved.count.toLocaleString('en-NG')} ${moved.count === 1 ? 'lot was' : 'lots were'} updated.`,
        },
        before: { source, target },
        after: {
          target: await this.brandSnapshot(tx, v.targetId),
          lots: moved.count,
        },
      };
    });
  }

  async removeBrand(who: AuthIdentity, input: unknown) {
    const v = parseInput(lotSetupDeleteSchema, input);
    return this.change(who, v, 'brand', 'deleted', async (tx) => {
      await tx.$queryRaw`SELECT id FROM brands WHERE id=${v.id}::uuid FOR UPDATE`;
      const before = await this.brandSnapshot(tx, v.id);
      if (!before) throw new NotFoundException();
      assertFresh(before.updatedAt, v.expectedUpdatedAt, 'brand');
      const check = canDeleteBrand({
        lots: await tx.lot.count({ where: { brandId: v.id } }),
      });
      if (!check.allowed) throw blocked(check.reason);
      await tx.brand.delete({ where: { id: v.id } });
      return {
        result: { id: v.id, message: `${before.name} deleted.` },
        before,
        after: null,
      };
    });
  }

  // ---- Create lot form ----------------------------------------------------
  async options(who: AuthIdentity) {
    return this.db.$transaction(async (tx) => {
      await this.reader(tx, who, true);
      const categories = await tx.category.findMany({
        where: { archivedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        take: 500,
      });
      const names = new Map(categories.map((c) => [c.id, c.name]));
      const items = [];
      for (const c of categories) {
        const effective = await this.categories.effective(tx, c);
        items.push({
          id: c.id,
          parentId: c.parentId,
          name: c.name,
          path: c.parentId
            ? `${names.get(c.parentId) ?? ''} › ${c.name}`
            : c.name,
          ...effective,
        });
      }
      const today = new Date(Date.now() + 3600000).toISOString().slice(0, 10);
      const locations = await tx.location.findMany({
        where: { archivedAt: null, status: 'open' },
        orderBy: { name: 'asc' },
        take: 50,
        include: {
          bins: {
            where: { deletedAt: null, acceptsNewLots: true },
            orderBy: { code: 'asc' },
          },
        },
      });
      const binIds = locations.flatMap((l) => l.bins.map((b) => b.id));
      const heldRows = binIds.length
        ? await tx.$queryRaw<{ id: string; n: bigint }[]>`
            SELECT l.bin_id::text AS id, count(*) AS n FROM lots l
            WHERE l.bin_id IN (${Prisma.join(binIds.map((id) => Prisma.sql`${id}::uuid`))})
              AND ${CURRENT_LOT}
            GROUP BY l.bin_id`
        : [];
      const held = new Map(heldRows.map((r) => [r.id, Number(r.n)]));
      const brands = await tx.brand.findMany({
        orderBy: { name: 'asc' },
        take: 500,
        include: { categories: { select: { categoryId: true } } },
      });
      return lotSetupOptionsSchema.parse({
        categories: items,
        locations: locations
          .filter(
            (l) => !l.opensOn || l.opensOn.toISOString().slice(0, 10) <= today,
          )
          .map((l) => ({
            id: l.id,
            name: l.name,
            code: l.code,
            binRequiredToPublish: l.binRequiredToPublish,
            bins: l.bins.map((b) => ({
              id: b.id,
              code: b.code,
              full: binIsFull(b.capacity, held.get(b.id) ?? 0),
              held: held.get(b.id) ?? 0,
              capacity: b.capacity,
            })),
          })),
        brands: brands.map((b) => ({
          id: b.id,
          name: b.name,
          categoryIds: b.categories.map((c) => c.categoryId),
        })),
      });
    });
  }
}

const deletionCursor = {
  read(value: string | undefined) {
    if (!value) return null;
    try {
      const parsed = z
        .object({ at: z.iso.datetime(), id: z.uuid() })
        .strict()
        .parse(JSON.parse(Buffer.from(value, 'base64url').toString()));
      return { at: new Date(parsed.at), id: parsed.id };
    } catch {
      throw new BadRequestException(
        'Reload the deletion history and try again.',
      );
    }
  },
  write(row: { id: string; createdAt: Date } | undefined) {
    return row
      ? Buffer.from(
          JSON.stringify({ at: row.createdAt.toISOString(), id: row.id }),
        ).toString('base64url')
      : null;
  },
};

function deletedSnapshot(ciphertext: Uint8Array | null): {
  name?: string;
  code?: string;
} {
  if (!ciphertext) return {};
  try {
    const value = z
      .object({ name: z.string().optional(), code: z.string().optional() })
      .loose()
      .parse(JSON.parse(decryptPii(Buffer.from(ciphertext), 'audit')));
    return { name: value.name, code: value.code };
  } catch {
    return {};
  }
}
