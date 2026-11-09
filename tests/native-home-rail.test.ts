import { expect, it } from 'vitest';
import {
  homeRailWidth,
  homeGridWidth,
} from '../apps/mobile/lib/home-rail-width';

it.each([360, 390, 768, 1280])(
  'fills a single-item rail and grid at %i px',
  (width) => {
    expect(homeRailWidth(width, 1)).toBe(width - 32);
    expect(homeGridWidth(width, 1)).toBe(width - 32);
    expect(homeRailWidth(width, 2)).toBe(homeRailWidth(width, 4));
    expect(homeGridWidth(width, 2)).toBe(homeGridWidth(width, 4));
  },
);

it('keeps multi-item layouts unchanged and caps wide single cards', () => {
  expect(homeRailWidth(360, 2)).toBe(360 * 0.46);
  expect(homeGridWidth(360, 2)).toBe(158);
  expect(homeGridWidth(768, 2)).toBe(175);
  expect(homeRailWidth(1920, 1)).toBe(1368);
  expect(homeGridWidth(1920, 1)).toBe(1368);
});
