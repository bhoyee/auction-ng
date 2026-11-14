import { describe, expect, it } from 'vitest';
import {
  binIsFull,
  suggestLocationCode,
} from '../packages/shared/src/lot-setup';

describe('suggestLocationCode', () => {
  it.each([
    ['Ikeja Pickup Hub', 'IPH'],
    ['Lekki Phase One Centre', 'LPO'],
    ['Yaba Hub', 'YHU'],
    ['Ikeja', 'IKE'],
    ['Abuja Wuse 2', 'AWU'],
  ])('%s → %s', (name, code) => {
    expect(suggestLocationCode(name, new Set())).toBe(code);
  });

  it('moves to the next free code when the preferred one is taken', () => {
    expect(suggestLocationCode('Yaba Hub', new Set(['YHU']))).toBe('YAH');
    expect(suggestLocationCode('Ikeja', new Set(['IKE']))).toBe('IKJ');
    expect(suggestLocationCode('Ikeja', new Set(['IKE', 'IKJ']))).toBe('IKA');
  });

  it('always returns exactly three capital letters, even for unusual names', () => {
    for (const name of ['2nd Avenue Store', 'Ọ̀yọ́ Depot', '123', ''])
      expect(suggestLocationCode(name, new Set())).toMatch(/^[A-Z]{3}$/);
  });
});

describe('binIsFull', () => {
  it.each([
    [null, 50, false],
    [10, 9, false],
    [10, 10, true],
    [10, 12, true],
  ] as const)('capacity %s holding %s → %s', (capacity, held, full) => {
    expect(binIsFull(capacity, held)).toBe(full);
  });
});
