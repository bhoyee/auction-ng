import { describe, expect, it } from 'vitest';
import { auctionCountdown } from '../apps/mobile/lib/auction-countdown';
import { merchandisingRules } from '../packages/shared/src/index';
const serverNow = 1800000000000;
describe('native auction countdown presentation', () => {
  it('replaces a confirmed paused timer with the LotVanta label', () => {
    expect(
      auctionCountdown({ serverNow, endsAt: serverNow + 60000, paused: true })
        .message,
    ).toBe('Paused by LotVanta');
    expect(
      auctionCountdown({
        serverNow,
        endsAt: serverNow + 60000,
        paused: true,
        live: false,
      }).message,
    ).toBe('Reconnecting');
  });
  it('keeps four day/hour/minute/second segments', () => {
    expect(
      auctionCountdown({
        serverNow,
        endsAt: serverNow + ((24 + 5) * 3600 + 15 * 60 + 17) * 1000,
      }).segments,
    ).toEqual([
      { value: 1, unit: 'd' },
      { value: 5, unit: 'h' },
      { value: 15, unit: 'm' },
      { value: 17, unit: 's' },
    ]);
  });
  it('does not claim an ended auction from a disconnected stale snapshot', () => {
    const state = auctionCountdown({
      serverNow,
      endsAt: serverNow - 1000,
      live: false,
    });
    expect(state.message).toBe('Reconnecting');
    expect(state.segments).toEqual([]);
    expect(state.urgent).toBe(false);
  });
  it('keeps a confirmed closed result visible while disconnected', () => {
    expect(
      auctionCountdown({
        serverNow,
        endsAt: serverNow + 1000,
        live: false,
        closed: true,
      }).message,
    ).toBe('Ended');
  });
  it('waits for the server clock before showing a duration', () => {
    expect(
      auctionCountdown({ serverNow: 0, endsAt: serverNow + 1000 }).message,
    ).toBe('Syncing time');
  });
  it('uses the shared final-30-minute threshold and never marks upcoming stock urgent', () => {
    const endsAt = serverNow + merchandisingRules.closingWindowMs;
    expect(auctionCountdown({ serverNow, endsAt }).urgent).toBe(true);
    expect(auctionCountdown({ serverNow, endsAt: endsAt + 1 }).urgent).toBe(
      false,
    );
    expect(auctionCountdown({ serverNow, endsAt, upcoming: true }).urgent).toBe(
      false,
    );
  });
  it('waits for authoritative launch instead of labelling upcoming stock ended', () => {
    expect(
      auctionCountdown({ serverNow, endsAt: serverNow, upcoming: true })
        .message,
    ).toBe('Going live soon');
  });
  it('shows ended for a fresh expired auction', () => {
    expect(auctionCountdown({ serverNow, endsAt: serverNow }).message).toBe(
      'Ended',
    );
  });
});
