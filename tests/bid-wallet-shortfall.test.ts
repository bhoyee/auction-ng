import { expect, it } from 'vitest';
import { bidWalletShortfall } from '../packages/shared/src/fees';

it.each([
  [10000, 10000, 0, 0],
  [10000, 9999, 0, 1],
  [11500, 10000, 0, 1500],
  [12000, 2000, 10000, 0],
  [12000, 1999, 10000, 1],
  [9000, 0, 10000, 0],
  [
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER,
    0,
  ],
])(
  'compares total %i with available %i and same-item reservation %i',
  (total, available, reserved, expected) => {
    expect(bidWalletShortfall(total, available, reserved)).toBe(expected);
  },
);

it.each([-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
  'rejects unsafe kobo %s',
  (value) => {
    expect(() => bidWalletShortfall(value, 0)).toThrow();
    expect(() => bidWalletShortfall(1, value)).toThrow();
    expect(() => bidWalletShortfall(1, 0, value)).toThrow();
  },
);
