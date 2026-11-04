import { afterEach, expect, it, vi } from 'vitest';
import { createActivityReader } from '../apps/mobile/lib/activity-reader';
import { createBuyerClient } from '../packages/api-client/src/buyers';

afterEach(() => vi.unstubAllGlobals());
it('reads authoritative active watch and unread counts without visiting either page', async () => {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL) => {
      urls.push(input.pathname);
      return new Response(
        JSON.stringify(
          input.pathname.endsWith('/count')
            ? { count: 1 }
            : { unread: 3, awaitingPickup: 2 },
        ),
        { status: 200 },
      );
    }),
  );
  const api = createBuyerClient('http://example.test', {
    accessToken: 'synthetic',
    deviceId: 'synthetic',
  });
  expect(await api.watchCount()).toEqual({ count: 1 });
  expect(await api.notificationSummary()).toEqual({
    unread: 3,
    awaitingPickup: 2,
  });
  expect(urls).toEqual([
    '/buyers/watchlist/count',
    '/buyers/notifications/summary',
  ]);
});
it('rejects malformed counts rather than showing an invented balance', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () => new Response(JSON.stringify({ count: -1 }), { status: 200 }),
    ),
  );
  await expect(
    createBuyerClient('http://example.test', {
      accessToken: 'synthetic',
      deviceId: 'synthetic',
    }).watchCount(),
  ).rejects.toThrow();
});
it('publishes confirmed changes immediately when refreshed', async () => {
  let count = 0;
  const seen: number[] = [];
  const reader = createActivityReader(
    async () => count,
    (value) => seen.push(value),
  );
  await reader.refresh();
  count = 1;
  await reader.refresh();
  count = 0;
  await reader.refresh();
  expect(seen).toEqual([0, 1, 0]);
  reader.dispose();
});
it('queues a refresh during an in-flight read instead of dropping it', async () => {
  let resolveFirst: (value: number) => void = () => {};
  let calls = 0;
  const seen: number[] = [];
  const reader = createActivityReader(
    () =>
      ++calls === 1
        ? new Promise<number>((resolve) => {
            resolveFirst = resolve;
          })
        : Promise.resolve(1),
    (value) => seen.push(value),
  );
  const first = reader.refresh();
  await reader.refresh();
  resolveFirst(0);
  await first;
  expect(seen).toEqual([0, 1]);
  expect(calls).toBe(2);
  reader.dispose();
});
it('never publishes a previous signed-in owner response after disposal', async () => {
  let resolveRead: (value: number) => void = () => {};
  const seen: number[] = [];
  const reader = createActivityReader(
    () =>
      new Promise<number>((resolve) => {
        resolveRead = resolve;
      }),
    (value) => seen.push(value),
  );
  const pending = reader.refresh();
  reader.dispose();
  resolveRead(7);
  await pending;
  expect(seen).toEqual([]);
});
it('keeps the last confirmed count on temporary network failure', async () => {
  const seen: number[] = [];
  let failed = false;
  const reader = createActivityReader(
    async () => {
      if (failed) throw Error('offline');
      return 4;
    },
    (value) => seen.push(value),
  );
  await reader.refresh();
  failed = true;
  await reader.refresh();
  expect(seen).toEqual([4]);
  reader.dispose();
});
