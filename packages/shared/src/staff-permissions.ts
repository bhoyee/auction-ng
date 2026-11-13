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
  // Read-only access to Lot setup (categories, locations, bins, conditions,
  // suppliers, brands) for roles that pick these values on lots.
  'setup.read',
  'records.purge',
  // Relist unsold items from Unsold review (owner decision 2026-11-13).
  'lots.relist',
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
    'setup.manage',
    'setup.read',
    'lots.relist',
  ],
  support: ['dashboard.view', 'buyers.read', 'support.manage', 'setup.read'],
  intake: ['inventory.read', 'inventory.write', 'setup.read'],
  warehouse: ['pickup.manage', 'setup.read'],
  finance: ['finance.read', 'withdrawals.manage', 'setup.read'],
};
export function staffPermissionsFor(
  role: string,
  assigned?: readonly string[],
): StaffPermission[] {
  if (!staff.includes(role)) return [];
  if (role === 'admin') return [...STAFF_PERMISSIONS];
  const granted = assigned ?? defaults[role] ?? [];
  // Anyone who can change Lot setup can also read it.
  return [
    ...new Set(
      granted.includes('setup.manage') ? [...granted, 'setup.read'] : granted,
    ),
  ].filter(
    (value): value is StaffPermission =>
      STAFF_PERMISSIONS.some((p) => p === value) &&
      !['staff.manage', 'records.purge'].includes(value),
  );
}
