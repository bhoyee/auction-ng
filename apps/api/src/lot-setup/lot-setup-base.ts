import { ForbiddenException, HttpException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import type { AuthIdentity } from '../auth/auth-service';
import type { StaffAdminService } from '../staff-admin/staff-admin-service';
import { staffAccess } from '../auth/staff-access';
import { decryptPii, encryptPii } from '../security/pii';

export type Tx = Prisma.TransactionClient;

// Error shown next to a form field, e.g. a duplicate name.
export function fieldError(field: string, message: string, status = 409) {
  return new HttpException({ code: 'FIELD_ERROR', field, message }, status);
}

// A plain-language reason the whole form shows, e.g. why a delete is blocked.
export const blocked = (message: string) => fieldError('form', message, 409);

// Zod failures at the API boundary become one plain-language field error.
export function parseInput<T extends z.ZodType>(
  schema: T,
  input: unknown,
): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = issue?.path.map(String).join('.') || 'form';
  throw fieldError(
    /^[a-zA-Z][a-zA-Z0-9.]{0,60}$/.test(field) ? field : 'form',
    issue?.message && !issue.message.startsWith('Invalid')
      ? issue.message
      : 'Check this field and try again.',
    400,
  );
}

const resultSchema = z.object({ id: z.uuid(), message: z.string() }).strict();
export type SetupResult = z.infer<typeof resultSchema>;

const json = (value: unknown) =>
  JSON.stringify(value, (_, v: unknown) =>
    typeof v === 'bigint' ? v.toString() : v,
  );

export class LotSetupBase {
  constructor(protected readonly staff: StaffAdminService) {}
  protected get db() {
    return this.staff.ledger.db;
  }

  // Read access: anyone who can change Lot setup, read it, or create lots.
  protected async reader(tx: Tx, who: AuthIdentity, allowInventory = false) {
    const access = await staffAccess(tx, who.user.id);
    const permission = access.permissions.includes('setup.manage')
      ? 'setup.manage'
      : access.permissions.includes('setup.read')
        ? 'setup.read'
        : allowInventory && access.permissions.includes('inventory.read')
          ? 'inventory.read'
          : null;
    if (!permission)
      throw new ForbiddenException(
        'Your account does not have permission to view Lot setup.',
      );
    await this.staff.actor(tx, who, permission);
    return { canManage: permission === 'setup.manage' };
  }

  // One audited, idempotent change: permission check, exact-retry replay,
  // the work, and an audit row with before and after.
  protected async change(
    who: AuthIdentity,
    input: { idempotencyKey: string },
    entity: string,
    action: string,
    work: (tx: Tx) => Promise<{
      result: SetupResult;
      before: unknown;
      after: unknown;
    }>,
  ) {
    try {
      return await this.db.$transaction(
        async (tx) => {
          await this.staff.actor(tx, who, 'setup.manage');
          const hash = createHash('sha256')
            .update(json([entity, action, input]))
            .digest('hex');
          const prior = await tx.staffAction.findUnique({
            where: { id: input.idempotencyKey },
          });
          if (prior) {
            if (prior.actorId !== who.user.id || prior.hash !== hash)
              throw blocked(
                'This request key belongs to another change. Reload and try again.',
              );
            return resultSchema.parse(
              JSON.parse(
                decryptPii(Buffer.from(prior.resultCiphertext), 'staff-result'),
              ),
            );
          }
          const { result, before, after } = await work(tx);
          await tx.auditLog.create({
            data: {
              actorId: who.user.id,
              action: `lot_setup.${entity}.${action}`,
              entityType: entity,
              entityId: result.id,
              beforeCiphertext: before
                ? encryptPii(json(before), 'audit')
                : null,
              afterCiphertext: encryptPii(
                json({ input: { ...input, idempotencyKey: undefined }, after }),
                'audit',
              ),
            },
          });
          await tx.staffAction.create({
            data: {
              id: input.idempotencyKey,
              actorId: who.user.id,
              hash,
              resultCiphertext: encryptPii(json(result), 'staff-result'),
            },
          });
          return result;
        },
        { timeout: 30000 },
      );
    } catch (error) {
      throw this.friendly(error, entity);
    }
  }

  // Unique-index violations become field errors in plain words.
  private friendly(error: unknown, entity: string) {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      error.code !== 'P2002'
    )
      return error;
    const target = JSON.stringify(
      'meta' in error ? (error as { meta?: unknown }).meta : '',
    );
    const pick = (field: string, message: string) => fieldError(field, message);
    if (/slug/.test(target))
      return pick('slug', 'Another category already uses this web address.');
    if (/code/.test(target))
      return entity === 'bin'
        ? pick('code', 'This location already has a bin with this name.')
        : pick('code', 'Another location already uses this short code.');
    const names: Record<string, string> = {
      category: 'A category with this name already exists at this level.',
      location: 'Another location already uses this name.',
      condition: 'Another condition already uses this name.',
      supplier: 'A supplier with this name already exists.',
      brand: 'A brand with this name already exists.',
    };
    return pick(
      entity === 'condition' ? 'label' : 'name',
      names[entity] ?? 'This name is already used.',
    );
  }
}

// Optimistic concurrency: refuse to overwrite a newer saved version.
export function assertFresh(
  updatedAt: Date,
  expected: string | undefined,
  what: string,
) {
  if (expected && updatedAt.toISOString() !== expected)
    throw blocked(
      `Someone else changed this ${what}. Reload it before saving.`,
    );
}

// Strictly increasing update time, so the next optimistic check is exact.
export const nextUpdatedAt = (previous?: Date) =>
  new Date(Math.max(Date.now(), (previous?.getTime() ?? 0) + 1));

// Names stay reserved while an item is in Deleted items (the unique indexes
// include deleted rows), so say how to free the name instead of "taken".
export async function deletedNameClash(
  tx: Tx,
  kind: 'supplier' | 'brand' | 'location',
  name: string,
  excludeId?: string,
) {
  const where = {
    name: { equals: name.trim(), mode: 'insensitive' as const },
    ...(excludeId ? { NOT: { id: excludeId } } : {}),
  };
  const row =
    kind === 'supplier'
      ? await tx.supplier.findFirst({
          where: { ...where, deletedAt: { not: null } },
        })
      : kind === 'brand'
        ? await tx.brand.findFirst({
            where: { ...where, deletedAt: { not: null } },
          })
        : await tx.location.findFirst({
            where: { ...where, archivedAt: { not: null } },
          });
  if (row)
    throw fieldError(
      'name',
      `A deleted ${kind} is called “${row.name}”. Restore it from Deleted items, or delete it permanently first.`,
    );
}

export async function deletedCategoryClash(
  tx: Tx,
  input: { name: string; slug: string; parentId: string | null; id?: string },
) {
  const notSelf = input.id ? { NOT: { id: input.id } } : {};
  const sibling = await tx.category.findFirst({
    where: {
      archivedAt: { not: null },
      parentId: input.parentId,
      name: { equals: input.name.trim(), mode: 'insensitive' },
      ...notSelf,
    },
  });
  if (sibling)
    throw fieldError(
      'name',
      `A deleted category here is called “${sibling.name}”. Restore it from Deleted items, or delete it permanently first.`,
    );
  const slug = await tx.category.findFirst({
    where: { archivedAt: { not: null }, slug: input.slug, ...notSelf },
  });
  if (slug)
    throw fieldError(
      'slug',
      `A deleted category uses this web address. Restore it from Deleted items, or delete it permanently first.`,
    );
}
