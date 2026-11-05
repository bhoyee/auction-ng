import { ForbiddenException } from '@nestjs/common';
import { staffPermissionsFor, type StaffPermission } from '@auction-ng/shared';
import type { Prisma } from '../generated/prisma/client';
export async function staffAccess(
  db: Pick<Prisma.TransactionClient, 'user'>,
  id: string,
) {
  const user = await db.user.findUnique({
    where: { id },
    include: { staffMembership: { include: { role: true } } },
  });
  if (!user || user.status !== 'active' || user.archivedAt)
    throw new ForbiddenException('Your staff access is unavailable.');
  const assigned = user.staffMembership?.role;
  const permissions = staffPermissionsFor(
    user.role,
    assigned ? (assigned.archivedAt ? [] : assigned.permissions) : undefined,
  );
  return { user, permissions, roleName: assigned?.name ?? user.role };
}
export async function requireStaffPermission(
  db: Pick<Prisma.TransactionClient, 'user' | '$executeRaw'>,
  id: string,
  permission: StaffPermission,
) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock_shared(715,1)`;
  const access = await staffAccess(db, id);
  if (!access.permissions.includes(permission))
    throw new ForbiddenException(
      'Your account does not have permission for this action.',
    );
  return access;
}
