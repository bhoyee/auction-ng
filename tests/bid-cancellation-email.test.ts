import { expect, it } from 'vitest';
import { bidCancellationEmail } from '../apps/api/src/bids/bid-cancellation-email';
const value = {
  kind: 'cancelled',
  title: 'Phone <img src=x>',
  lotNumber: 'LOT-A7X9K3M2',
  feeKobo: 90000,
  premiumBps: 1500,
  endsAt: '2026-11-03T12:00:00.000Z',
  itemUrl: 'https://auction.example/lots/item',
};
it('discloses the cancellation fee/rate and escapes item text', () => {
  const mail = bidCancellationEmail(value);
  expect(mail.Text).toContain('₦900 (15%');
  expect(mail.Text).toContain('remaining bid reservation released');
  expect(mail.HTML).toContain('&lt;img src=x&gt;');
  expect(mail.HTML).not.toContain('<img src=x>');
});
it('invites fresh bids without resurrecting commitments or exposing private maxima', () => {
  const mail = bidCancellationEmail({ ...value, kind: 'reopened' });
  expect(mail.Text).toContain('Earlier bids will not reactivate automatically');
  expect(mail.Text).toContain('WAT');
  expect(mail.Text).not.toContain('Cancellation fee:');
});
