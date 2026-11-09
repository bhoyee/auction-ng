import { expect, it } from 'vitest';
import { buyerHomeCollections } from '../apps/web/lib/home-collections';
import type { CatalogueLot } from '../packages/shared/src/catalogue-schemas';
import { merchandisingRules } from '../packages/shared/src/merchandising';
it('selects four chronological ending lots without repeating closing or featured lots', () => {
  const now = Date.now();
  const lots = Array.from({ length: 20 }, (_, i) => ({
    id: String(i),
    status: 'open',
    endsAt: new Date(
      now + (i + 1) * (merchandisingRules.closingWindowMs / 4),
    ).toISOString(),
    isTopDeal: true,
    topDealOrder: i,
    thumbnail: null,
  })) as CatalogueLot[];
  const selected = buyerHomeCollections(lots.reverse(), now);
  expect(selected.closing.map((l) => l.id)).toEqual(['0', '1', '2', '3']);
  expect(selected.ending.map((l) => l.id)).toEqual(['4', '5', '6', '7']);
  expect(selected.deals).toHaveLength(4);
  const ids = Object.values(selected)
    .flat()
    .map((l) => l.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(selected.deals.every((l) => !selected.ending.includes(l))).toBe(true);
});
it('does not invent stock and excludes ended or scheduled items', () => {
  const now = Date.now();
  expect(buyerHomeCollections([], now)).toEqual({
    closing: [],
    ending: [],
    deals: [],
  });
  const lots = [
    { id: 'ended', status: 'open', endsAt: new Date(now).toISOString() },
    {
      id: 'scheduled',
      status: 'scheduled',
      endsAt: new Date(now + 60000).toISOString(),
    },
  ] as CatalogueLot[];
  expect(Object.values(buyerHomeCollections(lots, now)).flat()).toEqual([]);
});
