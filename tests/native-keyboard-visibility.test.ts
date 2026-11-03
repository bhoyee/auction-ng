import { expect, it } from 'vitest';
import {
  focusedFieldScroll,
  keyboardOverlap,
} from '../apps/mobile/lib/keyboard-visibility';

it('reserves only the actual overlap for overlay keyboards', () => {
  expect(keyboardOverlap(140, 700, 520)).toBe(320);
});
it('does not subtract keyboard space twice when Android already resized the window', () => {
  expect(keyboardOverlap(140, 380, 520)).toBe(0);
});
it('removes the reserved space after keyboard dismissal', () => {
  expect(keyboardOverlap(140, 700, null)).toBe(0);
});
it('scrolls by the on-screen password overlap including the modal/header offset', () => {
  expect(focusedFieldScroll(680, 840, 520, 0, 16)).toBe(176);
});
it('accounts for existing scroll and a viewport shorter than the keyboard boundary', () => {
  expect(focusedFieldScroll(540, 500, 520, 100, 16)).toBe(156);
});
it('does not jump a field that is already visible', () => {
  expect(focusedFieldScroll(460, 840, 520, 100, 16)).toBeNull();
});
