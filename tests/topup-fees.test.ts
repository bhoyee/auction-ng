import { expect, it } from 'vitest';
import {
  quoteBankTransfer,
  quoteCardFunding,
} from '../packages/shared/src/fees';
import { virtualAccountInputSchema } from '../packages/shared/src/payment-schemas';

it.each([
  [1, 0, 1],
  [49, 0, 49],
  [100, 1, 99],
  [149, 1, 148],
  [150, 2, 148],
  [1000000, 10000, 990000],
  [2999999, 30000, 2969999],
  [3000000, 30000, 2970000],
  [5000000, 30000, 4970000],
  [Number.MAX_SAFE_INTEGER, 30000, Number.MAX_SAFE_INTEGER - 30000],
])(
  'quotes %i kobo with a buyer-paid fee of %i',
  (transferKobo, feeKobo, creditKobo) => {
    expect(quoteBankTransfer(transferKobo)).toEqual({
      transferKobo,
      feeKobo,
      creditKobo,
      currency: 'NGN',
      feePolicy: 'paystack-dva-v1',
    });
  },
);
it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  'rejects invalid or non-creditable transfer %s',
  (value) => {
    expect(() => quoteBankTransfer(value)).toThrow();
  },
);
it('normalises local Nigerian numbers and rejects unknown fields or invalid consent', () => {
  const input = {
    firstName: 'Ada',
    lastName: 'Okafor',
    phone: '08030000000',
    bvn: '20012345678',
    bankCode: '007',
    accountNumber: '0123456789',
    consent: true,
    feePolicy: 'paystack-dva-v1',
  };
  expect(virtualAccountInputSchema.parse(input).phone).toBe('+2348030000000');
  expect(
    virtualAccountInputSchema.safeParse({ ...input, phone: '123' }).success,
  ).toBe(false);
  expect(
    virtualAccountInputSchema.safeParse({ ...input, consent: false }).success,
  ).toBe(false);
  expect(
    virtualAccountInputSchema.safeParse({ ...input, feeKobo: 0 }).success,
  ).toBe(false);
});
it.each([
  [100000, 'local', 1500, 98500],
  [249999, 'local', 3750, 246249],
  [250000, 'local', 13750, 236250],
  [1000000, 'local', 25000, 975000],
  [20000000, 'local', 200000, 19800000],
  [1000000, 'international', 49000, 951000],
  [1, 'local', 0, 1],
  [100, 'local', 2, 98],
] as const)(
  'quotes buyer-paid card fees on %i kobo (%s)',
  (amountKobo, cardType, feeKobo, creditKobo) => {
    expect(quoteCardFunding(amountKobo, cardType)).toEqual({
      amountKobo,
      cardType,
      feeKobo,
      creditKobo,
      currency: 'NGN',
      feePolicy: `paystack-card-${cardType}-v1`,
    });
  },
);
it('rejects unsafe card amounts, unsupported fee tiers and payments with no net credit', () => {
  for (const value of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])
    expect(() => quoteCardFunding(value, 'local')).toThrow();
  expect(() => quoteCardFunding(100, 'international')).toThrow();
  expect(() =>
    Reflect.apply(quoteCardFunding, null, [1000000, 'unknown']),
  ).toThrow();
});
