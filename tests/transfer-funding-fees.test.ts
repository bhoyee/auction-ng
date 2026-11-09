import { expect, it } from 'vitest';
import { quoteTransferFunding } from '../packages/shared/src/fees';
it.each([
  [100000, 1500],
  [249900, 3749],
  [250000, 13750],
  [1000000, 25000],
  [100000000, 200000],
])('quotes temporary transfer checkout at %i kobo', (amount, fee) => {
  expect(quoteTransferFunding(amount)).toEqual({
    amountKobo: amount,
    feeKobo: fee,
    creditKobo: amount - fee,
    currency: 'NGN',
    feePolicy: 'paystack-transfer-v1',
  });
});
it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
  'rejects invalid transfer amounts %s',
  (amount) => expect(() => quoteTransferFunding(amount)).toThrow(),
);
