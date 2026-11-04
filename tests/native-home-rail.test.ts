import { expect, it } from 'vitest';
import { homeRailWidth } from '../apps/mobile/lib/home-rail-width';

it.each([360, 390, 768, 1280])(
  'fills the inner closing rail for one lot at %i px',
  (width) => {
    expect(homeRailWidth(width, 1, true)).toBe(width - 32);
    expect(homeRailWidth(width, 2, true)).toBe(homeRailWidth(width, 4, true));
  },
);

it('keeps other rails at their normal card width and caps wide screens', () => {
  expect(homeRailWidth(360, 1, false)).toBe(360 * 0.46);
  expect(homeRailWidth(1920, 1, true)).toBe(1368);
});
