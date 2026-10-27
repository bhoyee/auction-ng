import { expect, it } from 'vitest';
import type { CatalogueLot } from '../packages/shared/src/catalogue-schemas';
import { homeCollections } from '../apps/web/lib/home-collections';

it('reserves imminent home lots and selects unique deals from the remaining stock', () => {
  const now = Date.parse('2026-10-27T12:00:00Z');
  const lots = Array.from({ length: 65 }, (_, index) => ({
    id: `lot-${index}`,
    status: index === 64 ? 'scheduled' : 'open',
    endsAt: new Date(now + (index - 1) * 20 * 60_000).toISOString(),
    startPriceKobo: index % 2 ? 500_000 : 2_000_000,
    retailPriceKobo: 10_000_000,
  })) as CatalogueLot[];
  const collections = homeCollections(lots.reverse(), now);
  const ids = Object.values(collections)
    .flat()
    .map((lot) => lot.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(collections.closing.map((lot) => lot.id)).toEqual(['lot-2']);
  expect(Object.keys(collections)).toEqual(['closing', 'deals']);
  expect(collections.deals.length).toBeGreaterThan(0);
  expect(ids).not.toContain('lot-64');
  expect(ids).not.toContain('lot-1');
});

it('does not manufacture closing stock or repeat sparse inventory', () => {
  const collections = homeCollections([], Date.now());
  expect(Object.values(collections).flat()).toEqual([]);
});

it('avoids repeated representative photographs as well as repeated lot IDs', () => {
  const now = Date.now();
  const lots = Array.from({ length: 40 }, (_, index) => ({
    id: `lot-${index}`,
    status: 'open',
    endsAt: new Date(now + (index + 3) * 60 * 60_000).toISOString(),
    startPriceKobo: 50000,
    retailPriceKobo: 500000,
    thumbnail: { thumbnailUrl: `/photo-${index % 20}.webp` },
  })) as CatalogueLot[];
  const selected = Object.values(homeCollections(lots, now)).flat();
  expect(new Set(selected.map((lot) => lot.thumbnail?.thumbnailUrl)).size).toBe(
    selected.length,
  );
});

it('gives the deals rail category variety before filling with more of one category', () => {
  const now = Date.now();
  const lots = Array.from({ length: 40 }, (_, index) => ({
    id: `lot-${index}`,
    categoryId: index < 25 ? 'beauty' : index < 35 ? 'fashion' : 'kitchen',
    status: 'open',
    endsAt: new Date(now + (index + 3) * 60 * 60_000).toISOString(),
    startPriceKobo: 2_000_000,
    retailPriceKobo: 20_000_000 - index * 100_000,
  })) as CatalogueLot[];
  const { deals } = homeCollections(lots, now);
  expect(deals.slice(0, 3).map((lot) => lot.categoryId)).toEqual([
    'beauty',
    'fashion',
    'kitchen',
  ]);
});
