import { expect, it } from 'vitest';
import {
  staffNotificationPermissions,
  staffNotificationHref,
} from '../packages/shared/src/staff-notifications';
it('keeps alerts within existing destination read permissions', () => {
  expect(
    staffNotificationPermissions([
      'withdrawals.manage',
      'bids.cancel',
      'auctions.manage',
    ]),
  ).toEqual([]);
  expect(
    staffNotificationPermissions(['withdrawals.manage', 'finance.read']),
  ).toContain('withdrawals.manage');
  expect(
    staffNotificationPermissions(['bids.cancel', 'support.manage']),
  ).toContain('bids.cancel');
  expect(
    staffNotificationPermissions(['auctions.manage', 'inventory.read']),
  ).toContain('auctions.manage');
});
it('keeps completed-sale links within current role permissions', () => {
  expect(
    staffNotificationHref('/?section=pickup', 'auctions.manage', [
      'auctions.manage',
      'inventory.read',
    ]),
  ).toBe('/?section=auctions');
  expect(
    staffNotificationHref('/?section=auctions', 'auctions.manage', [
      'auctions.manage',
      'inventory.read',
      'pickup.manage',
    ]),
  ).toBe('/?section=pickup');
});
