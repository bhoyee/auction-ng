import { expect, it } from 'vitest';
import { webVersionChanged } from '../apps/web/lib/version-change';

it('reloads only for a different valid production build', () => {
  expect(webVersionChanged('build-a', 'build-b')).toBe(true);
  for (const next of ['build-a', 'development', '', undefined, null, 5])
    expect(webVersionChanged('build-a', next)).toBe(false);
  expect(webVersionChanged('development', 'build-a')).toBe(false);
});
