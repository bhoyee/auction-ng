import { expect, it } from 'vitest';
import {
  calculateFixedPrice,
  quotePurchasePayment,
} from '../packages/shared/src/fees';
it.each([
  [1000000, 75000, 1075000],
  [1, 0, 1],
  [20, 2, 22],
  [50000, 3750, 53750],
])('prices fixed stock %d with tax only', (price, tax, total) => {
  expect(calculateFixedPrice(price)).toEqual({
    priceKobo: price,
    taxKobo: tax,
    totalKobo: total,
  });
});
it.each(['local_card', 'international_card', 'bank_transfer'] as const)(
  'grosses up %s with disclosed charges',
  (method) => {
    const quote = quotePurchasePayment(1075000, method);
    expect(quote.amountKobo - quote.feeKobo).toBe(quote.creditKobo);
    expect(quote.creditKobo).toBeGreaterThanOrEqual(1075000);
    expect(quote.creditKobo - 1075000).toBeLessThanOrEqual(1);
  },
);
it('rejects invalid or unsafe fixed prices', () => {
  for (const price of [-1, 0, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER])
    expect(() => calculateFixedPrice(price)).toThrow();
});
it('keeps the waived processing fee below its threshold and validates totals', () => {
  const quote = quotePurchasePayment(244000, 'local_card');
  expect(quote.amountKobo).toBeLessThan(250000);
  expect(quote.creditKobo).toBeGreaterThanOrEqual(244000);
  for (const amount of [0, -1, 0.5, Number.MAX_SAFE_INTEGER])
    expect(() => quotePurchasePayment(amount, 'local_card')).toThrow();
  expect(
    quotePurchasePayment(300000, 'local_card').creditKobo,
  ).toBeGreaterThanOrEqual(300000);
  expect(() => calculateFixedPrice(100, 10001)).toThrow();
  expect(
    quotePurchasePayment(1, 'international_card').creditKobo,
  ).toBeGreaterThanOrEqual(1);
});
