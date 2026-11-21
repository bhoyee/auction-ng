import { describe, expect, it } from 'vitest';
import {
  amountFontSize,
  firstName,
  initials,
} from '../apps/mobile/lib/amount-fit';
import { formatNaira } from '../packages/shared/src/money';

describe('native wallet amount sizing', () => {
  it('uses the full size for short amounts and shrinks long ones', () => {
    const width = 140; // half-width card content on a 360 px phone
    const short = amountFontSize(formatNaira(1_250_000), width);
    const long = amountFontSize(formatNaira(123_456_789_000), width);
    expect(short).toBe(28);
    expect(long).toBeLessThan(short);
    expect(long).toBeGreaterThanOrEqual(13);
  });

  it.each([6, 8, 10])(
    'fits a %i-digit Naira amount on one line in a 140 px card',
    (digits) => {
      const kobo = Number('9'.repeat(digits)) * 100;
      const text = formatNaira(kobo);
      const size = amountFontSize(text, 140);
      // Estimated rendered width stays inside the box.
      expect(text.length * size * 0.6).toBeLessThanOrEqual(140);
    },
  );

  it('grows again on wider screens and never exceeds the maximum', () => {
    const text = formatNaira(999_999_999_900);
    expect(amountFontSize(text, 320)).toBeGreaterThan(
      amountFontSize(text, 140),
    );
    expect(amountFontSize('₦5', 1000)).toBe(28);
  });

  it('falls back to the maximum before the box is measured', () => {
    expect(amountFontSize('₦12,500', 0)).toBe(28);
    expect(amountFontSize('', 140)).toBe(28);
  });
});

describe('native account greeting', () => {
  it('builds initials and a first name safely', () => {
    expect(initials('Gideon Okafor')).toBe('GO');
    expect(initials('  adaeze  ')).toBe('A');
    expect(initials('Chiamaka Ngozi Eze')).toBe('CN');
    expect(initials('')).toBe('?');
    expect(firstName('Gideon Okafor')).toBe('Gideon');
    expect(firstName(undefined)).toBe('there');
  });
});
