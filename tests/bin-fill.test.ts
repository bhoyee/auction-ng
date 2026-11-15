import { describe, expect, it } from 'vitest';
import { binFill } from '../packages/shared/src/lot-setup';

describe('binFill', () => {
  it.each([
    // capacity, held, expected
    [null, 0, 'empty'],
    [null, 500, 'has_space'],
    [20, 0, 'empty'],
    [20, 1, 'has_space'],
    [20, 15, 'has_space'],
    [20, 16, 'almost_full'],
    [20, 19, 'almost_full'],
    [20, 20, 'full'],
    [20, 25, 'full'],
    [1, 1, 'full'],
    [3, 2, 'has_space'],
    [5, 4, 'almost_full'],
  ] as const)('capacity %s holding %s is %s', (capacity, held, expected) => {
    expect(binFill(capacity, held)).toBe(expected);
  });
});
