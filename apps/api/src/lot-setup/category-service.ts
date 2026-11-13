import { NotFoundException } from '@nestjs/common';
import {
  canDeleteCategory,
  categoryDetailSchema,
  categoryMoveLotsSchema,
  categoryOrderSchema,
  categorySaveSchema,
  categoryTreeSchema,
  categoryVisibilitySchema,
  lotSetupDeleteSchema,
  fromLedgerKobo,
  type CategoryFieldView,
} from '@auction-ng/shared';
import type { AuthIdentity } from '../auth/auth-service';
import {
  LotSetupBase,
  blocked,
  assertFresh,
  fieldError,
  nextUpdatedAt,
  parseInput,
  type Tx,
  deletedCategoryClash,
} from './lot-setup-base';

export type Row = Awaited<ReturnType<Tx['category']['findUniqueOrThrow']>>;

export async function fieldsOf(tx: Tx, categoryId: string) {
  const rows = await tx.categoryField.findMany({
    where: { categoryId },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  return rows.map((f): CategoryFieldView => ({
    id: f.id,
    name: f.name,
    key: f.key,
    type: f.type as CategoryFieldView['type'],
    options: f.options,
    helpText: f.helpText,
    required: f.required,
    showToBuyers: f.showToBuyers,
  }));
}

export async function conditionsOf(tx: Tx, categoryId: string) {
  const rows = await tx.categoryCondition.findMany({
    where: { categoryId },
    include: { condition: true },
  });
  return rows
    .sort((a, b) => a.condition.sortOrder - b.condition.sortOrder)
    .map((r) => r.condition.key);
}

// Values a new lot in this category gets: its own, else its parent's.
export async function effectiveCategory(tx: Tx, row: Row) {
  const parent = row.parentId
    ? await tx.category.findUnique({ where: { id: row.parentId } })
    : null;
  const fields = !row.fieldsInherited
    ? await fieldsOf(tx, row.id)
    : parent && !parent.fieldsInherited
      ? await fieldsOf(tx, parent.id)
      : [];
  const allConditions = async () =>
    (
      await tx.condition.findMany({
        where: { active: true },
        orderBy: { sortOrder: 'asc' },
      })
    ).map((c) => c.key);
  const conditions = !row.conditionsInherited
    ? await conditionsOf(tx, row.id)
    : parent && !parent.conditionsInherited
      ? await conditionsOf(tx, parent.id)
      : await allConditions();
  const pick = <T>(own: T | null, inherited: T | null | undefined) =>
    own ?? inherited ?? null;
  return {
    runTimeMinutes: pick(
      row.defaultRunTimeMinutes,
      parent?.defaultRunTimeMinutes,
    ),
    minStartPriceKobo:
      row.minStartPriceKobo !== null
        ? fromLedgerKobo(row.minStartPriceKobo)
        : parent?.minStartPriceKobo != null
          ? fromLedgerKobo(parent.minStartPriceKobo)
          : null,
    minPhotos: pick(row.minPhotos, parent?.minPhotos),
    conditions,
    fields,
  };
}

export class CategoryService extends LotSetupBase {
  async tree(who: AuthIdentity) {
    return this.db.$transaction(async (tx) => {
      const { canManage } = await this.reader(tx, who);
      const rows = await tx.category.findMany({
        where: { archivedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        take: 500,
      });
      const counts = await tx.$queryRaw<
        { id: string; lots: bigint; live: bigint }[]
      >`SELECT l.category_id::text AS id, count(*) AS lots,
          count(*) FILTER (WHERE l.status IN ('open','closing')) AS live
        FROM lots l WHERE l.archived_at IS NULL GROUP BY l.category_id`;
      const own = new Map(counts.map((c) => [c.id, c]));
      const total = (id: string) => {
        const self = own.get(id);
        const children = rows.filter((r) => r.parentId === id);
        return children.reduce(
          (sum, child) => {
            const c = own.get(child.id);
            return {
              lots: sum.lots + Number(c?.lots ?? 0),
              live: sum.live + Number(c?.live ?? 0),
            };
          },
          { lots: Number(self?.lots ?? 0), live: Number(self?.live ?? 0) },
        );
      };
      return categoryTreeSchema.parse({
        canManage,
        items: rows.map((r) => ({
          id: r.id,
          parentId: r.parentId,
          name: r.name,
          slug: r.slug,
          icon: r.icon,
          sortOrder: r.sortOrder,
          isVisible: r.isVisible,
          ...total(r.id),
        })),
      });
    });
  }

  private fieldsOf(tx: Tx, categoryId: string) {
    return fieldsOf(tx, categoryId);
  }

  private conditionsOf(tx: Tx, categoryId: string) {
    return conditionsOf(tx, categoryId);
  }

  effective(tx: Tx, row: Row) {
    return effectiveCategory(tx, row);
  }

  async detail(who: AuthIdentity, id: string) {
    return this.db.$transaction(async (tx) => {
      const { canManage } = await this.reader(tx, who);
      const row = await tx.category.findUnique({ where: { id } });
      if (!row || row.archivedAt) throw new NotFoundException();
      const parent = row.parentId
        ? await tx.category.findUnique({ where: { id: row.parentId } })
        : null;
      const children = await tx.category.count({
        where: { parentId: id, archivedAt: null },
      });
      const [stats] = await tx.$queryRaw<
        {
          own_lots: bigint;
          live: bigint;
          closed: bigint;
          sold: bigint;
          retail_ratio: number | null;
        }[]
      >`WITH scope AS (
          SELECT id FROM categories WHERE id=${id}::uuid OR parent_id=${id}::uuid
        )
        SELECT
          (SELECT count(*) FROM lots WHERE category_id=${id}::uuid) AS own_lots,
          count(l.id) FILTER (WHERE l.status IN ('open','closing') AND l.archived_at IS NULL) AS live,
          count(l.id) FILTER (WHERE l.status='closed') AS closed,
          count(s.lot_id) FILTER (WHERE l.status='closed' AND s.status='paid') AS sold,
          avg(il.hammer_kobo::float8 / NULLIF(l.retail_price_kobo,0)::float8)
            FILTER (WHERE s.status='paid' AND l.retail_price_kobo > 0) AS retail_ratio
        FROM lots l
        LEFT JOIN lot_settlements s ON s.lot_id=l.id
        LEFT JOIN invoice_lines il ON il.lot_id=l.id
        WHERE l.category_id IN (SELECT id FROM scope)`;
      const audit = await tx.auditLog.findFirst({
        where: { entityType: 'category', entityId: id },
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { name: true } } },
      });
      const lots = Number(stats?.own_lots ?? 0);
      const closed = Number(stats?.closed ?? 0);
      return categoryDetailSchema.parse({
        id: row.id,
        parentId: row.parentId,
        parentName: parent?.name ?? null,
        name: row.name,
        slug: row.slug,
        icon: row.icon,
        description: row.description,
        isVisible: row.isVisible,
        updatedAt: row.updatedAt.toISOString(),
        editedBy: audit?.actor
          ? { name: audit.actor.name, at: audit.createdAt.toISOString() }
          : null,
        subcategories: children,
        defaults: {
          runTimeMinutes: row.defaultRunTimeMinutes,
          minStartPriceKobo:
            row.minStartPriceKobo === null
              ? null
              : fromLedgerKobo(row.minStartPriceKobo),
          minPhotos: row.minPhotos,
        },
        conditions: row.conditionsInherited
          ? null
          : await this.conditionsOf(tx, id),
        fields: row.fieldsInherited ? null : await this.fieldsOf(tx, id),
        effective: await this.effective(tx, row),
        stats: {
          liveLots: Number(stats?.live ?? 0),
          sellThroughPercent: closed
            ? Math.round((Number(stats?.sold ?? 0) / closed) * 100)
            : null,
          averageRetailPercent:
            stats?.retail_ratio == null
              ? null
              : Math.round(stats.retail_ratio * 100),
        },
        lots,
        deleteCheck: canDeleteCategory({ lots, children }),
        canManage,
      });
    });
  }

  private async snapshot(tx: Tx, id: string) {
    const row = await tx.category.findUnique({ where: { id } });
    if (!row) return null;
    return {
      ...row,
      fields: await this.fieldsOf(tx, id),
      conditions: await this.conditionsOf(tx, id),
    };
  }

  async save(who: AuthIdentity, input: unknown) {
    const v = parseInput(categorySaveSchema, input);
    return this.change(
      who,
      v,
      'category',
      v.id ? 'updated' : 'created',
      async (tx) => {
        let before: Awaited<ReturnType<CategoryService['snapshot']>> = null;
        if (v.id) {
          await tx.$queryRaw`SELECT id FROM categories WHERE id=${v.id}::uuid FOR UPDATE`;
          before = await this.snapshot(tx, v.id);
          if (!before || before.archivedAt) throw new NotFoundException();
          assertFresh(before.updatedAt, v.expectedUpdatedAt, 'category');
        }
        await deletedCategoryClash(tx, {
          name: v.name,
          slug: v.slug,
          parentId: v.parentId ?? null,
          id: v.id,
        });
        if (v.parentId) {
          const parent = await tx.category.findUnique({
            where: { id: v.parentId },
          });
          if (!parent || parent.archivedAt || parent.id === v.id)
            throw fieldError(
              'parentId',
              'Choose another parent category.',
              400,
            );
          if (parent.parentId)
            throw fieldError(
              'parentId',
              'Categories go two levels deep. Pick a top-level category as the parent.',
              400,
            );
          if (
            v.id &&
            (await tx.category.count({ where: { parentId: v.id } })) > 0
          )
            throw fieldError(
              'parentId',
              'This category has subcategories, so it must stay at the top level.',
              400,
            );
        }
        if (v.fields) {
          const keys = v.fields.map((f) => f.key);
          const clash = keys.find((k, i) => keys.indexOf(k) !== i);
          if (clash)
            throw fieldError(
              'fields',
              'Two fields have the same name. Give each field its own name.',
              400,
            );
        }
        const data = {
          name: v.name,
          slug: v.slug,
          parentId: v.parentId,
          description: v.description,
          icon: v.icon,
          defaultRunTimeMinutes: v.defaultRunTimeMinutes,
          minStartPriceKobo:
            v.minStartPriceKobo === null ? null : BigInt(v.minStartPriceKobo),
          minPhotos: v.minPhotos,
          fieldsInherited: v.fields === null,
          conditionsInherited: v.conditions === null,
          updatedAt: nextUpdatedAt(before?.updatedAt),
        };
        const sortOrder =
          (
            await tx.category.aggregate({
              where: { parentId: v.parentId },
              _max: { sortOrder: true },
            })
          )._max.sortOrder ?? 0;
        const row = v.id
          ? await tx.category.update({ where: { id: v.id }, data })
          : await tx.category.create({
              data: { ...data, sortOrder: sortOrder + 1 },
            });
        // Field and condition changes apply to new lots; existing lots keep
        // the details they were created with.
        await tx.categoryField.deleteMany({ where: { categoryId: row.id } });
        if (v.fields?.length)
          await tx.categoryField.createMany({
            data: v.fields.map((f, i) => ({
              categoryId: row.id,
              name: f.name,
              key: f.key,
              type: f.type,
              options: f.type === 'list' ? f.options : [],
              helpText: f.helpText,
              required: f.required,
              showToBuyers: f.showToBuyers,
              sortOrder: i,
            })),
          });
        await tx.categoryCondition.deleteMany({
          where: { categoryId: row.id },
        });
        if (v.conditions?.length) {
          const conditions = await tx.condition.findMany({
            where: { key: { in: v.conditions } },
          });
          await tx.categoryCondition.createMany({
            data: conditions.map((c) => ({
              categoryId: row.id,
              conditionId: c.id,
            })),
          });
        }
        return {
          result: { id: row.id, message: `${row.name} saved.` },
          before,
          after: await this.snapshot(tx, row.id),
        };
      },
    );
  }

  async order(who: AuthIdentity, input: unknown) {
    const v = parseInput(categoryOrderSchema, input);
    return this.change(who, v, 'category', 'reordered', async (tx) => {
      const siblings = await tx.category.findMany({
        where: { parentId: v.parentId, archivedAt: null },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, sortOrder: true },
      });
      const expected = new Set(siblings.map((s) => s.id));
      if (
        v.ids.length !== expected.size ||
        v.ids.some((id) => !expected.has(id)) ||
        new Set(v.ids).size !== v.ids.length
      )
        throw blocked('The category list changed. Reload it and drag again.');
      for (const [index, id] of v.ids.entries())
        await tx.category.update({
          where: { id },
          data: { sortOrder: index + 1 },
        });
      const first = v.ids[0] ?? '';
      return {
        result: { id: first, message: 'New order saved.' },
        before: siblings,
        after: v.ids,
      };
    });
  }

  async visibility(who: AuthIdentity, input: unknown) {
    const v = parseInput(categoryVisibilitySchema, input);
    return this.change(
      who,
      v,
      'category',
      v.visible ? 'shown' : 'hidden',
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM categories WHERE id=${v.id}::uuid FOR UPDATE`;
        const before = await tx.category.findUnique({ where: { id: v.id } });
        if (!before || before.archivedAt) throw new NotFoundException();
        assertFresh(before.updatedAt, v.expectedUpdatedAt, 'category');
        const after = await tx.category.update({
          where: { id: v.id },
          data: {
            isVisible: v.visible,
            updatedAt: nextUpdatedAt(before.updatedAt),
          },
        });
        return {
          result: {
            id: v.id,
            message: v.visible
              ? `${after.name} is visible to buyers.`
              : `${after.name} is hidden from buyers.`,
          },
          before,
          after,
        };
      },
    );
  }

  async moveLots(who: AuthIdentity, input: unknown) {
    const v = parseInput(categoryMoveLotsSchema, input);
    return this.change(who, v, 'category', 'lots_moved', async (tx) => {
      await tx.$queryRaw`SELECT id FROM categories WHERE id IN (${v.id}::uuid, ${v.targetId}::uuid) ORDER BY id FOR UPDATE`;
      const [source, target] = await Promise.all([
        tx.category.findUnique({ where: { id: v.id } }),
        tx.category.findUnique({ where: { id: v.targetId } }),
      ]);
      if (!source) throw new NotFoundException();
      if (!target || target.archivedAt)
        throw fieldError('targetId', 'Pick an active category.', 400);
      const moved = await tx.lot.updateMany({
        where: { categoryId: v.id },
        data: { categoryId: v.targetId },
      });
      return {
        result: {
          id: v.id,
          message: `Moved ${moved.count.toLocaleString('en-NG')} ${moved.count === 1 ? 'lot' : 'lots'} to ${target.name}.`,
        },
        before: { categoryId: v.id, lots: moved.count },
        after: { categoryId: v.targetId, lots: moved.count },
      };
    });
  }

  async remove(who: AuthIdentity, input: unknown) {
    const v = parseInput(lotSetupDeleteSchema, input);
    return this.change(who, v, 'category', 'deleted', async (tx) => {
      await tx.$queryRaw`SELECT id FROM categories WHERE id=${v.id}::uuid FOR UPDATE`;
      const before = await this.snapshot(tx, v.id);
      if (!before) throw new NotFoundException();
      assertFresh(before.updatedAt, v.expectedUpdatedAt, 'category');
      const check = canDeleteCategory({
        lots: await tx.lot.count({ where: { categoryId: v.id } }),
        children: await tx.category.count({ where: { parentId: v.id } }),
      });
      if (!check.allowed) throw blocked(check.reason);
      // Moves to Deleted items; restore or delete permanently from there.
      const after = await tx.category.update({
        where: { id: v.id },
        data: {
          archivedAt: new Date(),
          updatedAt: nextUpdatedAt(before.updatedAt),
        },
      });
      return {
        result: { id: v.id, message: `${before.name} moved to Deleted items.` },
        before,
        after,
      };
    });
  }
}
