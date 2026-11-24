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
  // Delete lots (soft delete, restorable by an admin for 30 days).
  'lots.delete',
  // Inventory batches (T15e): names and item counts; mark received; add, edit,
  // close and write off; and what stock cost and earned.
  'batches.read',
  'batches.receive',
  'batches.manage',
  'batches.costs',
  // Supplier contacts and totals, and their bank details.
  'suppliers.read',
  'suppliers.bank',
  // What one lot cost.
  'lots.cost',
  // Invoices (T15f): see; resend, note; ask for a refund (refunds.manage
  // approves, never your own); company details printed on invoices.
  'invoices.read',
  'invoices.manage',
  'refunds.request',
  'company.manage',
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
    'lots.delete',
    'batches.read',
    'batches.receive',
    'batches.manage',
    'batches.costs',
    'suppliers.read',
    'invoices.read',
    'invoices.manage',
    'refunds.request',
    'refunds.manage',
  ],
  support: [
    'dashboard.view',
    'buyers.read',
    'support.manage',
    'setup.read',
    'invoices.read',
    'invoices.manage',
    'refunds.request',
  ],
  intake: [
    'inventory.read',
    'inventory.write',
    'setup.read',
    'batches.read',
    'batches.receive',
  ],
  warehouse: ['pickup.manage', 'setup.read', 'batches.read', 'batches.receive'],
  finance: [
    'finance.read',
    'withdrawals.manage',
    'setup.read',
    'batches.read',
    'batches.costs',
    'suppliers.read',
    'suppliers.bank',
    'lots.cost',
    'invoices.read',
    'invoices.manage',
    'refunds.request',
    'refunds.manage',
  ],
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
