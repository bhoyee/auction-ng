import { expect, it } from 'vitest';
import { focusedFieldOffset } from '../apps/mobile/lib/keyboard-reveal';

it.each([
  [0, 100, 500, 200, 48, 16, 0],
  [50, 100, 200, 450, 48, 16, 264],
  [50, 100, 400, 450, 48, 16, 64],
  [100, 80, 220, 180, 120, 16, 116],
  [0, 0, 280, 240, 48, 16, 24],
  [-5, 100, 500, 200, 48, 16, 0],
])(
  'reveals the whole field for offset/viewport/input %j %j %j %j %j',
  (offset, top, height, inputTop, inputHeight, gap, expected) => {
    expect(
      focusedFieldOffset(offset, top, height, inputTop, inputHeight, gap),
    ).toBe(expected);
  },
);
