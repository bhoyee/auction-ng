import { expect, it } from 'vitest';
import { tokens } from '../packages/ui/tokens';

function luminance(hex: string) {
  const values = [1, 3, 5].map((index) => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (
    (values[0] ?? 0) * 0.2126 +
    (values[1] ?? 0) * 0.7152 +
    (values[2] ?? 0) * 0.0722
  );
}
const c = tokens.colors;
it.each([
  [c.ink, c.surface],
  [c.ink, c.canvas],
  [c['slate-600'], c.canvas],
  [c['slate-600'], c.surface],
  [c.surface, c['indigo-900']],
  [c.surface, c['indigo-700']],
  [c.surface, c['outbid-600']],
  [c['outbid-600'], c.surface],
  [c['win-600'], c.surface],
  [c['indigo-900'], c['indigo-50']],
  [c.ink, c['danfo-400']],
])('meets AA body contrast for %s on %s', (foreground, background) => {
  const a = luminance(foreground);
  const b = luminance(background);
  expect(
    (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
  ).toBeGreaterThanOrEqual(4.5);
});
