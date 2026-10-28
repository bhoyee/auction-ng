import { expect, it } from 'vitest';
import type { CatalogueLot } from '../packages/shared/src/catalogue-schemas';
import { homeCollections } from '../apps/web/lib/home-collections';

it('reserves imminent home lots and selects unique deals from the remaining stock', () => {
  const now = Date.parse('2026-10-27T12:00:00Z');
  const lots = Array.from({ length: 65 }, (_, index) => ({
    id: `lot-${index}`,
    isTopDeal: true,
    topDealOrder: index,
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

it('excludes every under-twenty-minute lot from deals even when closing is full', () => {
  const now = Date.now();
  const lots = Array.from({ length: 12 }, (_, index) => ({
    id: `soon-${index}`,
    categoryId: 'tech',
    status: 'open',
    endsAt: new Date(now + 20 * 60_000).toISOString(),
    startPriceKobo: 50000,
    retailPriceKobo: 500000,
    thumbnail: null,
  })) as CatalogueLot[];
  const result = homeCollections(lots, now);
  expect(result.closing).toHaveLength(6);
  expect(result.deals).toEqual([]);
});

it('moves a lot at the boundary, removes it at expiry and honours an extended end', () => {
  const now = Date.now();
  const lot = {
    id: 'transition',
    isTopDeal: true,
    topDealOrder: 0,
    categoryId: 'tech',
    status: 'open',
    endsAt: new Date(now + 20 * 60_000 + 1000).toISOString(),
    startPriceKobo: 50000,
    retailPriceKobo: 500000,
    thumbnail: null,
  } as CatalogueLot;
  expect(homeCollections([lot], now).deals).toHaveLength(1);
  expect(homeCollections([lot], now + 1000).closing).toHaveLength(1);
  expect(homeCollections([lot], Date.parse(lot.endsAt)).closing).toEqual([]);
  const extended = {
    ...lot,
    endsAt: new Date(now + 25 * 60_000).toISOString(),
  };
  expect(homeCollections([extended], now).deals).toHaveLength(1);
  expect(
    homeCollections([{ ...extended, status: 'closed' }], now).deals,
  ).toEqual([]);
});

it('avoids repeated representative photographs as well as repeated lot IDs', () => {
  const now = Date.now();
  const lots = Array.from({ length: 40 }, (_, index) => ({
    id: `lot-${index}`,
    isTopDeal: true,
    topDealOrder: index,
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

it('keeps the administrator display order without automatic category or discount ranking', () => {
  const now = Date.now();
  const lots = Array.from({ length: 40 }, (_, index) => ({
    id: `lot-${index}`,
    isTopDeal: true,
    topDealOrder: 40 - index,
    categoryId: index < 25 ? 'beauty' : index < 35 ? 'fashion' : 'kitchen',
    status: 'open',
    endsAt: new Date(now + (index + 3) * 60 * 60_000).toISOString(),
    startPriceKobo: 2_000_000,
    retailPriceKobo: 20_000_000 - index * 100_000,
  })) as CatalogueLot[];
  const { deals } = homeCollections(lots, now);
  expect(deals.slice(0, 3).map((lot) => lot.id)).toEqual([
    'lot-39',
    'lot-38',
    'lot-37',
  ]);
});
it('never automatically fills Top Deals with unselected lots', () => {
  const now = Date.now();
  const lot = {
    id: 'unselected',
    status: 'open',
    endsAt: new Date(now + 3600000).toISOString(),
    isTopDeal: false,
    topDealOrder: 0,
    thumbnail: null,
  } as CatalogueLot;
  expect(homeCollections([lot], now).deals).toEqual([]);
  expect(
    homeCollections([{ ...lot, isTopDeal: true }], now).deals,
  ).toHaveLength(1);
});
