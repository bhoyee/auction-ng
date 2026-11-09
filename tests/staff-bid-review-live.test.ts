import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { LiveLotState } from '../packages/api-client/src/realtime';
const fake = vi.hoisted(() => {
  let listener = () => {};
  const release = vi.fn();
  return {
    release,
    fire: () => listener(),
    close: vi.fn(),
    unsubscribe: vi.fn(),
    watchLot: vi.fn(() => release),
    getSnapshot: vi.fn<(id: string) => LiveLotState>(),
    subscribe: vi.fn((next: () => void) => {
      listener = next;
      return fake.unsubscribe;
    }),
  };
});
vi.mock('../packages/api-client/src/realtime', () => ({
  createRealtimeClient: vi.fn(() => fake),
}));
import { watchBidReviewUpdates } from '../packages/api-client/src/staff-bid-review-live';
import { createRealtimeClient } from '../packages/api-client/src/realtime';
const id = '8ae85106-cf7c-4a91-8640-82f32d1a83ff';
let current: LiveLotState;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(10000);
  current = {
    status: 'live',
    clockOffsetMs: 0,
    lot: {
      lotId: id,
      currentPriceKobo: 50000,
      endsAt: new Date(60000).toISOString(),
      streamId: '1-0',
      serverTime: new Date(10000).toISOString(),
      isLeader: false,
    },
  };
  fake.getSnapshot.mockImplementation(() => current);
});
afterEach(() => vi.useRealTimers());
it('refreshes on a live stream change and again after database persistence', async () => {
  const changed = vi.fn(),
    close = watchBidReviewUpdates('http://localhost:4001', [id, id], changed);
  expect(fake.watchLot).toHaveBeenCalledTimes(1);
  fake.fire();
  await vi.advanceTimersByTimeAsync(0);
  expect(changed).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1501);
  expect(changed).toHaveBeenCalledTimes(2);
  fake.fire();
  await vi.advanceTimersByTimeAsync(3000);
  expect(changed).toHaveBeenCalledTimes(2);
  if (!current.lot) throw Error('Missing fixture');
  current = { ...current, lot: { ...current.lot, streamId: '2-0' } };
  fake.fire();
  await vi.advanceTimersByTimeAsync(0);
  expect(changed).toHaveBeenCalledTimes(3);
  close();
});
it('coalesces bursts and cancels all callbacks and subscriptions on close', async () => {
  const changed = vi.fn(),
    close = watchBidReviewUpdates('http://localhost:4001', [id], changed);
  for (let n = 1; n <= 20; n++) {
    if (!current.lot) throw Error('Missing fixture');
    current = { ...current, lot: { ...current.lot, streamId: n + '-0' } };
    fake.fire();
  }
  await vi.advanceTimersByTimeAsync(0);
  expect(changed).toHaveBeenCalledTimes(1);
  close();
  await vi.advanceTimersByTimeAsync(5000);
  expect(changed).toHaveBeenCalledTimes(1);
  expect(fake.release).toHaveBeenCalledTimes(1);
  expect(fake.unsubscribe).toHaveBeenCalledTimes(1);
  expect(fake.close).toHaveBeenCalledTimes(1);
});
it('reconciles on reconnect even when the stream is unchanged', async () => {
  const changed = vi.fn(),
    close = watchBidReviewUpdates('http://localhost:4001', [id], changed);
  const live = current;
  fake.fire();
  await vi.advanceTimersByTimeAsync(2000);
  const before = changed.mock.calls.length;
  current = { ...current, status: 'reconnecting', lot: null };
  fake.fire();
  current = live;
  fake.fire();
  await vi.advanceTimersByTimeAsync(1001);
  expect(changed.mock.calls.length).toBe(before + 1);
  close();
});
it('opens no socket when there are no visible live items', () => {
  watchBidReviewUpdates('http://localhost:4001', [], vi.fn())();
  expect(createRealtimeClient).not.toHaveBeenCalled();
});
