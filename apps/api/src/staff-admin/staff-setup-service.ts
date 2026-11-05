import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  staffSetupQuerySchema,
  staffSetupSaveSchema,
  staffSetupArchiveSchema,
  staffSetupPageSchema,
  staffPreferencesSchema,
  staffPreferencesSaveSchema,
  staffPageVisitSchema,
  staffAuditDetailSchema,
  type StaffPermission,
} from '@auction-ng/shared';
import type { AuthIdentity } from '../auth/auth-service';
import type { Prisma } from '../generated/prisma/client';
import { StaffAdminService } from './staff-admin-service';
import { decryptPii } from '../security/pii';
import { staffAccess } from '../auth/staff-access';
type Tx = Prisma.TransactionClient;
export class StaffSetupService {
  constructor(private readonly staff: StaffAdminService) {}
  private get db() {
    return this.staff.ledger.db;
  }
  private async own(tx: Tx, who: AuthIdentity) {
    const a = await staffAccess(tx, who.user.id);
    const p = a.permissions[0];
    if (!p) throw new ForbiddenException();
    await this.staff.actor(tx, who, p);
    return p;
  }
  async list(who: AuthIdentity, input: unknown) {
    const v = staffSetupQuerySchema.parse(input);
    return this.db.$transaction(async (tx) => {
      await this.staff.actor(tx, who, 'setup.manage');
      const scope = JSON.stringify([
        who.user.id,
        v.kind,
        v.view,
        v.search ?? '',
      ]);
      let after: string | undefined;
      if (v.cursor) {
        try {
          const c = z
            .object({ id: z.uuid(), scope: z.string() })
            .strict()
            .parse(JSON.parse(Buffer.from(v.cursor, 'base64url').toString()));
          if (c.scope !== scope) throw Error();
          after = c.id;
        } catch {
          throw new BadRequestException(
            'Use pagination with the same filters.',
          );
        }
      }
      const where = {
        archivedAt: v.view === 'archived' ? { not: null } : null,
        ...(after ? { id: { gt: after } } : {}),
        ...(v.search
          ? { name: { contains: v.search, mode: 'insensitive' as const } }
          : {}),
      };
      const rows =
        v.kind === 'category'
          ? await tx.category.findMany({
              where,
              orderBy: { id: 'asc' },
              take: v.limit + 1,
              include: { _count: { select: { lots: true } } },
            })
          : await tx.location.findMany({
              where,
              orderBy: { id: 'asc' },
              take: v.limit + 1,
              include: { _count: { select: { lots: true } } },
            });
      const items = rows.slice(0, v.limit).map((r) => ({
        id: r.id,
        kind: v.kind,
        name: r.name,
        key: 'slug' in r ? r.slug : r.code,
        parentId: 'parentId' in r ? r.parentId : null,
        address: 'address' in r ? r.address : '',
        hours: 'hours' in r ? this.hours(r.hours) : '',
        capacityPerSlot: 'capacityPerSlot' in r ? r.capacityPerSlot : null,
        linkedLots: r._count.lots,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        archivedAt: r.archivedAt?.toISOString() ?? null,
      }));
      const last = items.at(-1);
      return staffSetupPageSchema.parse({
        items,
        nextCursor:
          rows.length > v.limit && last
            ? Buffer.from(JSON.stringify({ id: last.id, scope })).toString(
                'base64url',
              )
            : null,
      });
    });
  }
  private hours(value: Prisma.JsonValue) {
    if (typeof value === 'string') return value;
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof value.display === 'string'
    )
      return value.display;
    if (value && typeof value === 'object' && !Array.isArray(value))
      return Object.entries(value)
        .filter(([k, v]) => k !== 'timezone' && typeof v === 'string')
        .map(
          ([k, v]) =>
            `${k === 'weekdays' ? 'Monday–Friday' : k === 'mondayToSaturday' ? 'Monday–Saturday' : k}: ${String(v)}`,
        )
        .join('; ');
    return '';
  }
  private snapshot(kind: 'category' | 'location') {
    return async (tx: Tx, id: string) =>
      kind === 'category'
        ? tx.category.findUnique({ where: { id } })
        : tx.location.findUnique({ where: { id } });
  }
  private async guarded<T>(work: () => Promise<T>) {
    try {
      return await work();
    } catch (e) {
      if (
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        ['P2002', 'P2003'].includes(String(e.code))
      )
        throw new ConflictException(
          'This identifier is already used or the record has linked history.',
        );
      throw e;
    }
  }
  async save(who: AuthIdentity, input: unknown) {
    const v = staffSetupSaveSchema.parse(input);
    return this.guarded(() =>
      this.staff.mutation(
        who,
        v,
        'setup.manage',
        v.kind + '_saved',
        async (tx) => {
          if (v.id) {
            const rows =
              v.kind === 'category'
                ? await tx.$queryRaw<
                    { id: string }[]
                  >`SELECT id FROM categories WHERE id=${v.id}::uuid FOR UPDATE`
                : await tx.$queryRaw<
                    { id: string }[]
                  >`SELECT id FROM locations WHERE id=${v.id}::uuid FOR UPDATE`;
            if (!rows.length) throw new NotFoundException();
          }
          const before = v.id ? await this.snapshot(v.kind)(tx, v.id) : null;
          if (
            before &&
            (before.archivedAt ||
              before.updatedAt.toISOString() !== v.expectedUpdatedAt)
          )
            throw new ConflictException(
              'Reload the current active record before editing.',
            );
          if (v.id && !before) throw new NotFoundException();
          const updatedAt = new Date(
            Math.max(Date.now(), (before?.updatedAt.getTime() ?? 0) + 1),
          );
          let id: string;
          if (v.kind === 'category') {
            if (v.parentId) {
              const parent = await tx.category.findUnique({
                where: { id: v.parentId },
              });
              if (!parent || parent.archivedAt)
                throw new BadRequestException(
                  'Choose an active parent category.',
                );
              if (v.id) {
                const cycle = await tx.$queryRaw<
                  { id: string }[]
                >`WITH RECURSIVE ancestors AS (SELECT id,parent_id FROM categories WHERE id=${v.parentId}::uuid UNION SELECT c.id,c.parent_id FROM categories c JOIN ancestors a ON c.id=a.parent_id) SELECT id FROM ancestors WHERE id=${v.id}::uuid`;
                if (cycle.length)
                  throw new BadRequestException(
                    'A category cannot be its own ancestor.',
                  );
              }
            }
            const data = {
              name: v.name,
              slug: v.slug,
              parentId: v.parentId,
              updatedAt,
            };
            id = (
              v.id
                ? await tx.category.update({ where: { id: v.id }, data })
                : await tx.category.create({ data })
            ).id;
          } else {
            const data = {
              name: v.name,
              code: v.code,
              address: v.address,
              hours: { display: v.hours },
              capacityPerSlot: v.capacityPerSlot,
              updatedAt,
            };
            id = (
              v.id
                ? await tx.location.update({ where: { id: v.id }, data })
                : await tx.location.create({ data })
            ).id;
          }
          return {
            id,
            message:
              v.kind === 'category'
                ? 'Category saved.'
                : 'Pickup centre saved.',
          };
        },
        this.snapshot(v.kind),
      ),
    );
  }
  async archive(who: AuthIdentity, input: unknown) {
    const v = staffSetupArchiveSchema.parse(input);
    return this.guarded(() =>
      this.staff.mutation(
        who,
        v,
        v.operation === 'purge' ? 'records.purge' : 'setup.manage',
        v.kind + '_' + v.operation,
        async (tx) => {
          await this.staff.actor(tx, who, 'setup.manage');
          if (v.operation === 'purge' && who.user.role !== 'admin')
            throw new ForbiddenException();
          if (v.kind === 'category')
            await tx.$queryRaw`SELECT id FROM categories WHERE id=${v.id}::uuid FOR UPDATE`;
          else
            await tx.$queryRaw`SELECT id FROM locations WHERE id=${v.id}::uuid FOR UPDATE`;
          const r = await this.snapshot(v.kind)(tx, v.id);
          if (!r) throw new NotFoundException();
          if (r.updatedAt.toISOString() !== v.expectedUpdatedAt)
            throw new ConflictException('Reload before changing this record.');
          if (v.operation === 'purge') {
            if (!r.archivedAt)
              throw new ConflictException(
                'Archive the unused record before deleting it.',
              );
            if (v.kind === 'category')
              await tx.category.delete({ where: { id: r.id } });
            else await tx.location.delete({ where: { id: r.id } });
          } else {
            const archivedAt = v.operation === 'archive' ? new Date() : null;
            if (archivedAt) {
              const active = await tx.lot.count({
                where: {
                  ...(v.kind === 'category'
                    ? { categoryId: r.id }
                    : { locationId: r.id }),
                  status: { in: ['scheduled', 'open', 'closing'] },
                },
              });
              if (active)
                throw new ConflictException(
                  'This record is used by ongoing auctions.',
                );
              if (
                v.kind === 'category' &&
                (await tx.category.count({
                  where: { parentId: r.id, archivedAt: null },
                }))
              )
                throw new ConflictException('Archive child categories first.');
              if (
                v.kind === 'location' &&
                (await tx.fulfilment.count({
                  where: {
                    locationId: r.id,
                    collectedAt: null,
                    status: { notIn: ['cancelled', 'forfeited'] },
                  },
                }))
              )
                throw new ConflictException(
                  'Complete outstanding collections before archiving this centre.',
                );
            }
            if (
              v.kind === 'category' &&
              v.operation === 'restore' &&
              'parentId' in r &&
              r.parentId
            ) {
              const p = await tx.category.findUnique({
                where: { id: r.parentId },
              });
              if (p?.archivedAt)
                throw new ConflictException(
                  'Restore the parent category first.',
                );
            }
            const data = {
              archivedAt,
              updatedAt: new Date(
                Math.max(Date.now(), r.updatedAt.getTime() + 1),
              ),
            };
            if (v.kind === 'category')
              await tx.category.update({ where: { id: r.id }, data });
            else await tx.location.update({ where: { id: r.id }, data });
          }
          return {
            id: r.id,
            message:
              v.operation === 'purge'
                ? 'Unused record deleted.'
                : v.operation === 'restore'
                  ? 'Record restored.'
                  : 'Record archived.',
          };
        },
        this.snapshot(v.kind),
      ),
    );
  }
  async preferences(who: AuthIdentity) {
    return this.db.$transaction(async (tx) => {
      await this.own(tx, who);
      const r = await tx.user.findUniqueOrThrow({
        where: { id: who.user.id },
        select: { staffPreferences: true },
      });
      return staffPreferencesSchema.parse(r.staffPreferences);
    });
  }
  async savePreferences(who: AuthIdentity, input: unknown) {
    const v = staffPreferencesSaveSchema.parse(input);
    const access = await this.staff.me(who);
    const permission = access.permissions[0];
    if (!permission) throw new ForbiddenException();
    return this.staff.mutation(
      who,
      { ...v, id: who.user.id },
      permission,
      'preferences_saved',
      async (tx) => {
        await tx.user.update({
          where: { id: who.user.id },
          data: { staffPreferences: v.preferences },
        });
        return { id: who.user.id, message: 'Preferences saved.' };
      },
      async (tx, id) =>
        tx.user.findUnique({
          where: { id },
          select: { staffPreferences: true },
        }),
    );
  }
  async visit(who: AuthIdentity, input: unknown) {
    const v = staffPageVisitSchema.parse(input);
    const access = await this.staff.me(who);
    const mapping: Partial<Record<typeof v.page, StaffPermission>> = {
      overview: 'dashboard.view',
      inventory: 'inventory.read',
      auctions: 'auctions.manage',
      pickup: 'pickup.manage',
      categories: 'setup.manage',
      centres: 'setup.manage',
      buyers: 'buyers.read',
      support: 'support.manage',
      finance: 'finance.read',
      staff: 'staff.manage',
      audit: 'audit.read',
      trash: 'records.archive',
    };
    const permission = mapping[v.page] ?? access.permissions[0];
    if (!permission) throw new ForbiddenException();
    return this.staff.mutation(
      who,
      { ...v, reason: 'Staff opened ' + v.page },
      permission,
      'page_viewed',
      async () => ({ id: who.user.id, message: 'Activity recorded.' }),
    );
  }
  async audit(who: AuthIdentity, id: string) {
    z.uuid().parse(id);
    return this.db.$transaction(async (tx) => {
      await this.staff.actor(tx, who, 'audit.read');
      const r = await tx.auditLog.findUnique({
        where: { id },
        include: { actor: { select: { name: true } } },
      });
      if (!r) throw new NotFoundException();
      const clean = (v: unknown, depth = 0): unknown => {
        if (depth > 8) return '[truncated]';
        if (Array.isArray(v))
          return v.slice(0, 50).map((x) => clean(x, depth + 1));
        if (v && typeof v === 'object')
          return Object.fromEntries(
            Object.entries(v)
              .slice(0, 100)
              .map(([k, x]) => [
                k,
                /password|secret|token|otp|code|cipher|bvn|email|phone|address|recovery/i.test(
                  k,
                )
                  ? '[redacted]'
                  : clean(x, depth + 1),
              ]),
          );
        return typeof v === 'string' ? v.slice(0, 2000) : v;
      };
      const unpack = (b: Uint8Array | null) =>
        b
          ? JSON.stringify(
              clean(
                JSON.parse(
                  decryptPii(
                    Buffer.from(b),
                    r.action === 'payments.reconciliation'
                      ? 'reconciliation'
                      : 'audit',
                  ),
                ),
              ),
              null,
              2,
            ).slice(0, 20000)
          : null;
      return staffAuditDetailSchema.parse({
        id: r.id,
        actorId: r.actorId,
        actorName: r.actor?.name ?? 'System',
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        createdAt: r.createdAt.toISOString(),
        before: unpack(r.beforeCiphertext),
        after: unpack(r.afterCiphertext),
      });
    });
  }
}
