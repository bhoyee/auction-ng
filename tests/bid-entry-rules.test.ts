import { expect, it } from 'vitest';
import { minNextBid } from '../packages/shared/src/auction-rules';
import { resolveBid, type AuctionState } from '../packages/shared/src/proxy';
const empty: AuctionState = {
  startPriceKobo: 50000,
  currentPriceKobo: null,
  leader: null,
  endsAt: 1000000,
};
it('uses the starting price before the first bid and one kobo above an existing price', () => {
  expect(minNextBid(50000, null)).toBe(50000);
  for (const price of [50000, 499999, 500000, 2000000, 50000000])
    expect(minNextBid(50000, price)).toBe(price + 1);
  expect(() => minNextBid(50000, Number.MAX_SAFE_INTEGER)).toThrow();
});
it('accepts arbitrary higher direct amounts without a tier or multiple requirement', () => {
  const first = resolveBid(
    empty,
    { bidderId: 'a', maxKobo: 50000, mode: 'direct' },
    1,
  );
  for (const value of [50001, 50123, 59999, 1321750])
    expect(
      resolveBid(first, { bidderId: 'b', maxKobo: value, mode: 'direct' }, 2)
        .currentPriceKobo,
    ).toBe(value);
  for (const value of [49999, 50000])
    expect(() =>
      resolveBid(first, { bidderId: 'b', maxKobo: value, mode: 'direct' }, 2),
    ).toThrow();
  expect(() =>
    resolveBid(empty, { bidderId: 'a', maxKobo: 49999, mode: 'direct' }, 1),
  ).toThrow();
});
