import { expect, it } from 'vitest';
import {
  calculateWithdrawal,
  DEFAULT_WITHDRAWAL_RULES,
} from '../packages/shared/src/fees';
it.each([
  [100000, 1000, 0, 101000],
  [500000, 1000, 0, 501000],
  [500001, 2500, 0, 502501],
  [999999, 2500, 0, 1002499],
  [1000000, 2500, 5000, 1007500],
  [5000000, 2500, 5000, 5007500],
  [5000001, 5000, 5000, 5010001],
])('quotes %i kobo without floating point', (amount, fee, levy, total) => {
  expect(calculateWithdrawal(amount)).toEqual({
    amountKobo: amount,
    feeKobo: fee,
    levyKobo: levy,
    totalKobo: total,
  });
});
it.each([0, 99999, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])(
  'rejects invalid or overflowing amount %s',
  (value) => expect(() => calculateWithdrawal(value)).toThrow(),
);
it('validates configured limits and fees', () => {
  expect(() =>
    calculateWithdrawal(100000, {
      ...DEFAULT_WITHDRAWAL_RULES,
      minimumKobo: 0,
    }),
  ).toThrow();
  expect(() =>
    calculateWithdrawal(100000, {
      ...DEFAULT_WITHDRAWAL_RULES,
      lowFeeKobo: -1,
    }),
  ).toThrow();
  expect(
    calculateWithdrawal(50000, {
      ...DEFAULT_WITHDRAWAL_RULES,
      minimumKobo: 50000,
    }).totalKobo,
  ).toBe(51000);
});
