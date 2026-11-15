import { describe, expect, it } from 'vitest';
import {
  RELIST_PRICE_FLOOR_KOBO,
  relistStartPrice,
} from '../packages/shared/src/auction-rules';

describe('relistStartPrice', () => {
  it.each([
    // start kobo, percent, expected kobo
    [1_250_000, 0, 1_250_000], // 0% keeps the price exactly
    [1_250_000, 10, 1_125_000], // ₦12,500 less 10% = ₦11,250
    [1_000_000, 15, 850_000],
    [999_900, 10, 899_900], // ₦8,999.10 rounds to ₦8,999
    [999_950, 10, 900_000], // ₦8,999.55 rounds half up to ₦9,000
    [1_005_000, 10, 904_500], // exactly ₦9,045
    [60_000, 50, RELIST_PRICE_FLOOR_KOBO], // never below ₦500
    [55_000, 10, RELIST_PRICE_FLOOR_KOBO], // ₦495 is lifted to ₦500
    [30_000, 20, 30_000], // already under ₦500: never raised, never cut
    [50_000, 25, 50_000], // at the floor stays at the floor
    [12_345, 0, 12_345], // 0% keeps kobo amounts untouched
  ])('₦%s kobo less %s%% is %s kobo', (start, percent, expected) => {
    expect(relistStartPrice(start, percent)).toBe(expected);
  });

  it.each([
    // start, percent, category floor, expected
    [200_000, 50, 200_000, 200_000], // category minimum ₦2,000 holds
    [300_000, 50, 200_000, 200_000], // ₦1,500 lifted to the ₦2,000 minimum
    [300_000, 10, 200_000, 270_000], // above the minimum: normal cut
    [100_000, 50, 20_000, 50_000], // a lower category minimum never beats ₦500
    [150_000, 20, 200_000, 150_000], // already below the minimum: unchanged
  ])(
    '₦%s kobo less %s%% with a %s kobo floor is %s',
    (start, percent, floor, expected) => {
      expect(relistStartPrice(start, percent, floor)).toBe(expected);
    },
  );

  it('stays exact for very large prices', () => {
    expect(relistStartPrice(Number.MAX_SAFE_INTEGER - 1, 0)).toBe(
      Number.MAX_SAFE_INTEGER - 1,
    );
    // ₦90 trillion less 10% = ₦81 trillion exactly.
    expect(relistStartPrice(9_000_000_000_000_000, 10)).toBe(
      8_100_000_000_000_000,
    );
  });

  it('compounds when applied on each relist', () => {
    const once = relistStartPrice(1_000_000, 10);
    expect(relistStartPrice(once, 10)).toBe(810_000);
  });

  it.each([
    [1_000_000, -1],
    [1_000_000, 51],
    [1_000_000, 2.5],
    [-100, 10],
    [10.5, 10],
  ])('rejects start %s with percent %s', (start, percent) => {
    expect(() => relistStartPrice(start, percent)).toThrow();
  });
});
