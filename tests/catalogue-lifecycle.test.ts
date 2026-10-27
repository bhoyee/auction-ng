import { expect, it } from 'vitest';
import { catalogueLotVisible } from '../apps/web/lib/catalogue-lifecycle';

it('hides elapsed and terminal catalogue cards without changing auction state', () => {
  const now = Date.now();
  expect(
    catalogueLotVisible('open', new Date(now + 1).toISOString(), now),
  ).toBe(true);
  expect(catalogueLotVisible('closing', new Date(now).toISOString(), now)).toBe(
    false,
  );
  expect(
    catalogueLotVisible('closed', new Date(now + 1000).toISOString(), now),
  ).toBe(false);
  expect(
    catalogueLotVisible('cancelled', new Date(now + 1000).toISOString(), now),
  ).toBe(false);
  expect(
    catalogueLotVisible('open', new Date(now + 120000).toISOString(), now),
  ).toBe(true);
});
