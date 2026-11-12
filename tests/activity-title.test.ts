import { expect, it } from 'vitest';
import { activityTitle } from '../apps/api/src/staff-admin/staff-admin-service';

it.each([
  ['lot_setup.category.deleted', 'Lot setup · Category deleted'],
  ['lot_setup.category.lots_moved', 'Lot setup · Category lots moved'],
  ['lot_setup.bin.deleted', 'Lot setup · Bin deleted'],
  ['withdrawal.approved', 'withdrawal.approved'],
])('%s → %s', (action, title) => {
  expect(activityTitle(action)).toBe(title);
});
