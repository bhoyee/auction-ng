import { expect, it } from 'vitest';
import { activityTitle } from '../apps/api/src/staff-admin/staff-admin-service';

it.each([
  ['lot_setup.category.deleted', 'Lot setup · Category moved to Deleted items'],
  ['lot_setup.brand.purged', 'Lot setup · Brand deleted permanently'],
  ['lot_setup.supplier.restored', 'Lot setup · Supplier restored'],
  ['lot_setup.category.lots_moved', 'Lot setup · Category lots moved'],
  ['lot_setup.bin.deleted', 'Lot setup · Bin moved to Deleted items'],
  ['withdrawal.approved', 'withdrawal.approved'],
])('%s → %s', (action, title) => {
  expect(activityTitle(action)).toBe(title);
});
