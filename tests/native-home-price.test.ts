import { expect, it } from 'vitest';
import { homePrice } from '../apps/mobile/lib/home-price';

it('shows the starting price when a fresh snapshot confirms no bids', () => {
  expect(
    homePrice(50000, { status: 'live', lot: { currentPriceKobo: null } }),
  ).toBe(50000);
});
it('shows the current price from a fresh live snapshot', () => {
  expect(
    homePrice(50000, { status: 'live', lot: { currentPriceKobo: 850000 } }),
  ).toBe(850000);
});
it.each(['connecting', 'reconnecting', 'unavailable', 'unauthenticated'])(
  'does not present an old price as live while %s',
  (status) => {
    expect(
      homePrice(50000, { status, lot: { currentPriceKobo: 850000 } }),
    ).toBeUndefined();
  },
);
it('waits for a snapshot rather than presenting a catalogue price as current', () => {
  expect(homePrice(50000, { status: 'live', lot: null })).toBeUndefined();
});
