import { expect, it } from 'vitest';
import {
  staffPermissionsFor,
  STAFF_PERMISSIONS,
} from '../packages/shared/src/staff-permissions';
it('keeps root administration exclusive to admins', () => {
  expect(staffPermissionsFor('admin')).toEqual([...STAFF_PERMISSIONS]);
  expect(
    staffPermissionsFor('manager', [
      'staff.manage',
      'records.purge',
      'inventory.write',
    ]),
  ).toEqual(['inventory.write']);
});
it('gives managers operations but no default money or account control', () => {
  const p = staffPermissionsFor('manager');
  expect(p).toContain('pickup.manage');
  expect(p).toContain('auctions.manage');
  expect(p).not.toContain('refunds.manage');
  expect(p).not.toContain('staff.manage');
});
it('custom assignments replace rather than add to legacy defaults', () => {
  expect(staffPermissionsFor('manager', ['support.manage'])).toEqual([
    'support.manage',
  ]);
  expect(staffPermissionsFor('manager', [])).toEqual([]);
  expect(staffPermissionsFor('buyer', ['inventory.write'])).toEqual([]);
});
it('retains narrow legacy staff rights', () => {
  expect(staffPermissionsFor('finance')).toContain('withdrawals.manage');
  expect(staffPermissionsFor('warehouse')).not.toContain('auctions.manage');
  expect(staffPermissionsFor('support')).not.toContain('buyers.manage');
});
