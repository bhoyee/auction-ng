export const STAFF_PERMISSIONS = [
  'dashboard.view',
  'inventory.read',
  'inventory.write',
  'auctions.manage',
  'bids.read',
  'storage.manage',
  'storage.adjust',
  'pickup.manage',
  'buyers.read',
  'buyers.manage',
  'support.manage',
  'finance.read',
  'refunds.manage',
  'withdrawals.manage',
  'wallet.manage',
  'fees.manage',
  'bids.cancel',
  'audit.read',
  'records.archive',
  'staff.manage',
  'setup.manage',
  'records.purge',
] as const;
export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];
const staff = ['admin', 'manager', 'intake', 'warehouse', 'finance', 'support'];
const defaults: Record<string, readonly StaffPermission[]> = {
  manager: [
    'dashboard.view',
    'inventory.read',
    'inventory.write',
    'auctions.manage',
    'pickup.manage',
    'records.archive',
  ],
  support: ['dashboard.view', 'buyers.read', 'support.manage'],
  intake: ['inventory.read', 'inventory.write'],
  warehouse: ['pickup.manage'],
  finance: ['finance.read', 'withdrawals.manage'],
};
export function staffPermissionsFor(
  role: string,
  assigned?: readonly string[],
): StaffPermission[] {
  if (!staff.includes(role)) return [];
  if (role === 'admin') return [...STAFF_PERMISSIONS];
  return [...new Set(assigned ?? defaults[role] ?? [])].filter(
    (value): value is StaffPermission =>
      STAFF_PERMISSIONS.some((p) => p === value) &&
      !['staff.manage', 'records.purge'].includes(value),
  );
}
