import { expect, it } from 'vitest';
import { calculateBidCancellationFee } from '../packages/shared/src/fees';
it.each([
  [600000, 1500, 90000],
  [550000, 1500, 82500],
  [1, 5000, 1],
  [1, 4999, 0],
  [Number.MAX_SAFE_INTEGER, 10000, Number.MAX_SAFE_INTEGER],
  [500000, 0, 0],
])(
  'charges the configured service percentage once, rounded half up (%s/%s)',
  (price, bps, expected) =>
    expect(calculateBidCancellationFee(price, bps)).toBe(expected),
);
it('rejects unsafe amounts and invalid rates', () => {
  for (const [price, bps] of [
    [-1, 1500],
    [1.2, 1000],
    [Number.MAX_SAFE_INTEGER + 1, 1000],
    [100, 10001],
  ])
    expect(() => calculateBidCancellationFee(price, bps)).toThrow();
});
