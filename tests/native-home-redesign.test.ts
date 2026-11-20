import { describe, expect, it } from 'vitest';
import {
  celebratedKey,
  celebrationCandidates,
  CELEBRATE_WITHIN_MS,
  FIRST_RUN_WITHIN_MS,
  readCelebrated,
  rememberCelebrated,
  type WinInvoice,
} from '../apps/mobile/lib/win-celebration';
import { homeCardCopy } from '../apps/mobile/lib/home-cards';
import { tabBarLayout } from '../apps/mobile/lib/tab-bar-layout';

const now = Date.parse('2026-11-20T10:00:00.000Z');
const hoursAgo = (hours: number) =>
  new Date(now - hours * 3_600_000).toISOString();
const invoice = (over: Partial<WinInvoice> = {}): WinInvoice => ({
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  saleType: 'auction',
  status: 'pending',
  createdAt: hoursAgo(1),
  totalKobo: 250_000,
  ...over,
});

describe('native win celebration', () => {
  it('celebrates the newest unseen auction win first', () => {
    const older = invoice({ id: 'older', createdAt: hoursAgo(20) });
    const newer = invoice({
      id: 'newer',
      createdAt: hoursAgo(2),
      status: 'paid',
    });
    expect(
      celebrationCandidates([older, newer], new Set(), now, false).map(
        (item) => item.id,
      ),
    ).toEqual(['newer', 'older']);
  });

  it('never celebrates Buy Now purchases, refunds, cancellations or seen wins', () => {
    const items = [
      invoice({ id: 'buy-now', saleType: 'fixed_price' }),
      invoice({ id: 'refunded', status: 'refunded' }),
      invoice({ id: 'cancelled', status: 'cancelled' }),
      invoice({ id: 'seen' }),
      invoice({
        id: 'future',
        createdAt: new Date(now + 3_600_000).toISOString(),
      }),
      invoice({ id: 'broken', createdAt: 'not a date' }),
    ];
    expect(celebrationCandidates(items, new Set(['seen']), now, false)).toEqual(
      [],
    );
  });

  it('only looks back two days on a first run, two weeks afterwards', () => {
    const recent = invoice({ id: 'recent', createdAt: hoursAgo(30) });
    const week = invoice({ id: 'week', createdAt: hoursAgo(24 * 7) });
    const stale = invoice({ id: 'stale', createdAt: hoursAgo(24 * 15) });
    const ids = (firstRun: boolean) =>
      celebrationCandidates(
        [recent, week, stale],
        new Set(),
        now,
        firstRun,
      ).map((item) => item.id);
    expect(ids(true)).toEqual(['recent']);
    expect(ids(false)).toEqual(['recent', 'week']);
    expect(FIRST_RUN_WITHIN_MS).toBeLessThan(CELEBRATE_WITHIN_MS);
  });

  it('remembers shown wins per account, newest first and bounded', () => {
    expect(celebratedKey('u1')).not.toBe(celebratedKey('u2'));
    const previous = Array.from({ length: 70 }, (_, index) => `old-${index}`);
    const next = rememberCelebrated(previous, ['new', 'old-0']);
    expect(next[0]).toBe('new');
    expect(next).toHaveLength(60);
    expect(new Set(next).size).toBe(next.length);
  });

  it('treats a missing or damaged record as a first run', () => {
    expect(readCelebrated(null)).toEqual({ firstRun: true, ids: [] });
    expect(readCelebrated('{oops')).toEqual({ firstRun: true, ids: [] });
    expect(readCelebrated('[1,2]')).toEqual({ firstRun: true, ids: [] });
    expect(readCelebrated('["a","b"]')).toEqual({
      firstRun: false,
      ids: ['a', 'b'],
    });
  });
});

describe('native home summary cards', () => {
  it('shows a dash while loading instead of an invented zero', () => {
    const copy = homeCardCopy({});
    expect([copy.wallet.value, copy.pickup.value, copy.savings.value]).toEqual([
      '—',
      '—',
      '—',
    ]);
  });

  it('formats balances, pickups and estimated savings in Naira', () => {
    const copy = homeCardCopy({
      availableKobo: 1_250_000,
      awaitingPickup: 3,
      savedKobo: 33_829_400,
      paidItems: 12,
    });
    expect(copy.wallet.value).toBe('₦12,500');
    expect(copy.pickup.value).toBe('3 items');
    expect(copy.savings.value).toBe('₦338,294');
    expect(copy.savings.detail).toBe('Estimated, on 12 paid items');
  });

  it('uses friendly empty states and singular wording', () => {
    expect(homeCardCopy({ awaitingPickup: 0 }).pickup.value).toBe(
      'All collected',
    );
    expect(homeCardCopy({ awaitingPickup: 1 }).pickup.value).toBe('1 item');
    expect(homeCardCopy({ savedKobo: 0, paidItems: 0 }).savings.detail).toBe(
      'Win your first deal to start saving',
    );
    expect(homeCardCopy({ savedKobo: 500, paidItems: 1 }).savings.detail).toBe(
      'Estimated, on 1 paid item',
    );
  });
});

describe('native tab bar', () => {
  it('shows the watching count on the Watchlist button, capped at 99+', () => {
    expect(tabBarLayout.badge(undefined)).toBeUndefined();
    expect(tabBarLayout.badge(0)).toBeUndefined();
    expect(tabBarLayout.badge(-2)).toBeUndefined();
    expect(tabBarLayout.badge(7)).toBe('7');
    expect(tabBarLayout.badge(99)).toBe('99');
    expect(tabBarLayout.badge(140)).toBe('99+');
  });
});
