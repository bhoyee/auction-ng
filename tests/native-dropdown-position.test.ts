import { expect, it } from 'vitest';
import { dropdownPosition } from '../apps/mobile/lib/dropdown-position';

const viewport = { width: 360, height: 800, top: 24, bottom: 40 };
it('opens directly below a field when both options fit', () => {
  expect(
    dropdownPosition(
      { x: 16, y: 200, width: 328, height: 48 },
      viewport,
      112,
      4,
    ),
  ).toEqual({ left: 16, top: 252, width: 328, maxHeight: 112 });
});
it('opens above a field near the bottom instead of covering navigation', () => {
  const box = dropdownPosition(
    { x: 16, y: 700, width: 328, height: 48 },
    viewport,
    112,
    4,
  );
  expect(box.top).toBe(584);
  expect(box.top + box.maxHeight).toBeLessThan(700);
});
it.each([360, 768, 1280])(
  'keeps options within the %i px screen with large text',
  (width) => {
    const box = dropdownPosition(
      { x: width - 180, y: 200, width: 328, height: 48 },
      { ...viewport, width },
      900,
      4,
    );
    expect(box.left).toBeGreaterThanOrEqual(4);
    expect(box.left + box.width).toBeLessThanOrEqual(width - 4);
    expect(box.top + box.maxHeight).toBeLessThanOrEqual(
      viewport.height - viewport.bottom,
    );
  },
);
