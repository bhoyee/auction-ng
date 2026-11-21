import { describe, expect, it } from 'vitest';
import {
  browseCollections,
  cardAction,
  collectionFromParam,
  collectionParam,
  collectionSection,
} from '../apps/mobile/lib/browse-collections';

const id = '1c9430d2-a5ef-4c7b-99bf-ee237aa55383';
const card = {
  id,
  fixedPriceKobo: 4_500_000,
  instantWin: true,
  upcoming: false,
  comingSoon: false,
  paused: false,
};

describe('native browse collections', () => {
  it('lists Instant Win between Ending Soon and Upcoming, as on the website', () => {
    expect(browseCollections).toEqual([
      'All Deals',
      'Top Deals',
      'Ending Soon',
      'Instant Win',
      'Upcoming',
    ]);
  });

  it('maps links, tabs and API sections both ways', () => {
    for (const collection of browseCollections.filter(
      (value) => value !== 'Upcoming',
    ))
      expect(collectionFromParam(collectionParam(collection))).toBe(collection);
    expect(collectionFromParam('instant')).toBe('Instant Win');
    expect(collectionSection('Instant Win')).toBe('instant-win');
    expect(collectionSection('Top Deals')).toBe('top-deals');
    expect(collectionSection('Ending Soon')).toBe('ending-soon');
    expect(collectionSection('All Deals')).toBe('all');
    expect(collectionFromParam(undefined)).toBe('All Deals');
    expect(collectionFromParam('anything-else')).toBe('All Deals');
  });

  it('buys at the fixed price from the Instant Win list', () => {
    expect(cardAction(card)).toEqual({
      buyPrice: 4_500_000,
      href: `/lots/${id}?buy=1`,
      label: 'Buy now ₦45,000',
    });
    expect(cardAction({ ...card, paused: true }).label).toBe('Buying paused');
  });

  it('keeps bidding everywhere else and for lots without a valid fixed price', () => {
    for (const input of [
      { ...card, instantWin: false },
      { ...card, fixedPriceKobo: null },
      { ...card, fixedPriceKobo: 0 },
      { ...card, fixedPriceKobo: 12.5 },
    ])
      expect(cardAction(input)).toEqual({
        buyPrice: null,
        href: `/lots/${id}`,
        label: 'Bid now',
      });
    expect(cardAction({ ...card, instantWin: false, paused: true }).label).toBe(
      'Bidding paused',
    );
    expect(cardAction({ ...card, upcoming: true }).label).toBe(
      'View and pre-bid',
    );
    expect(
      cardAction({ ...card, upcoming: true, comingSoon: true }).label,
    ).toBe('View and watch');
  });
});
