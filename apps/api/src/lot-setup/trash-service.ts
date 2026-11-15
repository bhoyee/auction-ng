import { BadRequestException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import {
  canDeleteBrand,
  canDeleteCategory,
  lotSetupDeletedKinds,
  lotSetupDeletionListSchema,
  lotSetupDeletionPageSchema,
  lotSetupTrashActionSchema,
  type LotSetupDeletedKind,
} from '@auction-ng/shared';
import type { AuthIdentity } from '../auth/auth-service';
import {
  LotSetupBase,
  blocked,
  nextUpdatedAt,
  parseInput,
  type Tx,
} from './lot-setup-base';

type TrashRow = {
  kind: LotSetupDeletedKind;
  id: string;
  name: string;
  detail: string | null;
  at: Date;
};

// Deleted items (owner decision 2026-11-13): deleting a Lot setup item moves
// it here; staff can restore it or delete it permanently. Items stay until
// someone deletes them permanently.
export class TrashService extends LotSetupBase {
  async list(who: AuthIdentity, input: unknown) {
    const q = parseInput(lotSetupDeletionListSchema, input);
    const cursor = trashCursor.read(q.cursor);
    const search = q.search ? `%${q.search.replace(/[\\%_]/g, '\\$&')}%` : null;
    return this.db.$transaction(async (tx) => {
      const { canManage } = await this.reader(tx, who);
      const rows = await tx.$queryRaw<TrashRow[]>`
        SELECT kind, id, name, detail, at FROM (
          SELECT 'category' AS kind, c.id::text AS id, c.name, NULL::text AS detail, c.archived_at AS at
            FROM categories c WHERE c.archived_at IS NOT NULL
          UNION ALL
          SELECT 'location', l.id::text, l.name, l.code, l.archived_at
            FROM locations l WHERE l.archived_at IS NOT NULL
          UNION ALL
          SELECT 'bin', b.id::text, b.code, loc.name, b.deleted_at
            FROM bins b JOIN locations loc ON loc.id = b.location_id
            WHERE b.deleted_at IS NOT NULL
          UNION ALL
          SELECT 'supplier', s.id::text, s.name, NULL, s.deleted_at
            FROM suppliers s WHERE s.deleted_at IS NOT NULL
          UNION ALL
          SELECT 'brand', br.id::text, br.name, NULL, br.deleted_at
            FROM brands br WHERE br.deleted_at IS NOT NULL
        ) d
        WHERE (${search}::text IS NULL OR d.name ILIKE ${search} OR d.detail ILIKE ${search})
          AND (${cursor?.at ?? null}::timestamptz IS NULL
            OR (d.at, d.id) < (${cursor?.at ?? null}::timestamptz, ${cursor?.id ?? null}::text))
        ORDER BY d.at DESC, d.id DESC
        LIMIT ${q.limit + 1}`;
      const page = rows.slice(0, q.limit);
      const who_ = await this.deletedBy(tx, page);
      return lotSetupDeletionPageSchema.parse({
        canManage,
        items: page.map((row) => ({
          id: row.id,
          kind: z.enum(lotSetupDeletedKinds).parse(row.kind),
          name: row.name,
          detail: row.detail,
          deletedBy: who_.get(`${row.kind}:${row.id}`) ?? 'Not recorded',
          deletedAt: row.at.toISOString(),
        })),
        nextCursor:
          rows.length > q.limit ? trashCursor.write(page.at(-1)) : null,
      });
    });
  }

  // Latest "deleted" audit row per item gives who moved it to Deleted items.
  private async deletedBy(tx: Tx, rows: TrashRow[]) {
    const names = new Map<string, string>();
    if (!rows.length) return names;
    const audits = await tx.auditLog.findMany({
      where: {
        action: {
          in: lotSetupDeletedKinds.map((k) => `lot_setup.${k}.deleted`),
        },
        OR: rows.map((row) => ({ entityType: row.kind, entityId: row.id })),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { actor: { select: { name: true } } },
    });
    for (const audit of audits) {
      const key = `${audit.entityType}:${audit.entityId}`;
      if (!names.has(key)) names.set(key, audit.actor?.name ?? 'System');
    }
    return names;
  }

  async restore(who: AuthIdentity, input: unknown) {
    const v = parseInput(lotSetupTrashActionSchema, input);
    return this.change(who, v, v.kind, 'restored', async (tx) => {
      const { name, before } = await this.deletedItem(tx, v.kind, v.id);
      const now = { updatedAt: nextUpdatedAt(before.updatedAt) };
      let after: unknown;
      if (v.kind === 'category') {
        const parentId = (before as { parentId: string | null }).parentId;
        if (parentId) {
          const parent = await tx.category.findUnique({
            where: { id: parentId },
          });
          if (parent?.archivedAt)
            throw blocked(`Restore its main category “${parent.name}” first.`);
        }
        after = await tx.category.update({
          where: { id: v.id },
          data: { archivedAt: null, ...now },
        });
      } else if (v.kind === 'location') {
        after = await tx.location.update({
          where: { id: v.id },
          data: { archivedAt: null, ...now },
        });
      } else if (v.kind === 'bin') {
        const bin = before as { locationId: string; code: string };
        const location = await tx.location.findUnique({
          where: { id: bin.locationId },
        });
        if (location?.archivedAt)
          throw blocked(`Restore the location “${location.name}” first.`);
        const clash = await tx.bin.findFirst({
          where: {
            locationId: bin.locationId,
            code: bin.code,
            deletedAt: null,
          },
        });
        if (clash)
          throw blocked(
            `Another bin at this location is already called ${bin.code}. Rename or delete it first.`,
          );
        after = await tx.bin.update({
          where: { id: v.id },
          data: { deletedAt: null, ...now },
        });
      } else if (v.kind === 'supplier') {
        after = await tx.supplier.update({
          where: { id: v.id },
          data: { deletedAt: null, ...now },
        });
      } else {
        after = await tx.brand.update({
          where: { id: v.id },
          data: { deletedAt: null, ...now },
        });
      }
      return {
        result: { id: v.id, message: `${name} restored.` },
        before,
        after,
      };
    });
  }

  async purge(who: AuthIdentity, input: unknown) {
    const v = parseInput(lotSetupTrashActionSchema, input);
    return this.change(who, v, v.kind, 'purged', async (tx) => {
      const { name, before } = await this.deletedItem(tx, v.kind, v.id);
      // Check every link first: a failed delete would abort the transaction.
      if (v.kind === 'category') {
        const check = canDeleteCategory({
          lots: await tx.lot.count({ where: { categoryId: v.id } }),
          children: await tx.category.count({ where: { parentId: v.id } }),
        });
        if (!check.allowed) throw blocked(check.reason);
        await tx.category.delete({ where: { id: v.id } });
      } else if (v.kind === 'location') {
        const where = { locationId: v.id };
        const history = await Promise.all([
          tx.lot.count({ where }),
          tx.fulfilment.count({ where }),
          tx.pickupStorageCase.count({ where }),
          tx.pickupVisit.count({ where }),
          tx.pickupVisitPass.count({ where }),
        ]);
        if (history.some(Boolean))
          throw blocked(
            'This location has lots or pickup history, so it can’t be deleted permanently.',
          );
        await tx.bin.deleteMany({ where });
        await tx.pickupStorageCentre.deleteMany({ where });
        await tx.location.delete({ where: { id: v.id } });
      } else if (v.kind === 'bin') {
        if (await tx.lot.count({ where: { binId: v.id } }))
          throw blocked(
            'This bin has item history, so it stays in Deleted items.',
          );
        await tx.bin.delete({ where: { id: v.id } });
      } else if (v.kind === 'supplier') {
        if (await tx.lot.count({ where: { supplierId: v.id } }))
          throw blocked(
            'Lots came from this supplier, so it stays in Deleted items.',
          );
        await tx.supplier.delete({ where: { id: v.id } });
      } else {
        const check = canDeleteBrand({
          lots: await tx.lot.count({ where: { brandId: v.id } }),
        });
        if (!check.allowed) throw blocked(check.reason);
        await tx.brand.delete({ where: { id: v.id } });
      }
      return {
        result: { id: v.id, message: `${name} deleted permanently.` },
        before,
        after: null,
      };
    });
  }

  // Locks the item and confirms it is in Deleted items.
  private async deletedItem(tx: Tx, kind: LotSetupDeletedKind, id: string) {
    const table = {
      category: 'categories',
      location: 'locations',
      bin: 'bins',
      supplier: 'suppliers',
      brand: 'brands',
    }[kind];
    await tx.$queryRawUnsafe(
      `SELECT id FROM ${table} WHERE id = $1::uuid FOR UPDATE`,
      id,
    );
    const row =
      kind === 'category'
        ? await tx.category.findUnique({ where: { id } })
        : kind === 'location'
          ? await tx.location.findUnique({ where: { id } })
          : kind === 'bin'
            ? await tx.bin.findUnique({ where: { id } })
            : kind === 'supplier'
              ? await tx.supplier.findUnique({ where: { id } })
              : await tx.brand.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    const deleted =
      'archivedAt' in row && row.archivedAt
        ? row.archivedAt
        : 'deletedAt' in row
          ? row.deletedAt
          : null;
    if (!deleted)
      throw blocked('This item isn’t in Deleted items. Reload and try again.');
    const name =
      'code' in row && kind === 'bin'
        ? `Bin ${row.code}`
        : String((row as { name?: string }).name ?? 'Item');
    return { name, before: row };
  }
}

const trashCursor = {
  read(value: string | undefined) {
    if (!value) return null;
    try {
      const parsed = z
        .object({ at: z.iso.datetime(), id: z.uuid() })
        .strict()
        .parse(JSON.parse(Buffer.from(value, 'base64url').toString()));
      return { at: new Date(parsed.at), id: parsed.id };
    } catch {
      throw new BadRequestException('Reload Deleted items and try again.');
    }
  },
  write(row: TrashRow | undefined) {
    return row
      ? Buffer.from(
          JSON.stringify({ at: row.at.toISOString(), id: row.id }),
        ).toString('base64url')
      : null;
  },
};
