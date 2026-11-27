import { expect, it, vi } from 'vitest';
import { createBuyerInactivity } from '../packages/api-client/src/session-inactivity';
import { ApiError } from '../packages/api-client/src/auth';

function fixture() {
  let now = 0,
    lastActive = 0;
  const read = vi.fn(async (activity: boolean) => {
    if (now - lastActive >= 900_000) throw new ApiError(401);
    if (activity) lastActive = now;
    return {
      serverTime: new Date(now).toISOString(),
      idleExpiresAt: new Date(lastActive + 900_000).toISOString(),
      expiresAt: new Date(30 * 86400_000).toISOString(),
    };
  });
  const expired = vi.fn(),
    update = vi.fn();
  const monitor = createBuyerInactivity({
    read,
    now: () => now,
    expired,
    update,
  });
  return {
    read,
    expired,
    update,
    monitor,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
it('polls never extend the idle deadline and expiration runs once', async () => {
  const f = fixture();
  await f.monitor.sync();
  f.advance(840_000);
  await f.monitor.sync();
  f.monitor.tick();
  expect(f.update.mock.lastCall?.[0].seconds).toBe(60);
  f.advance(60_000);
  f.monitor.tick();
  f.monitor.tick();
  await f.monitor.sync(true);
  expect(f.expired).toHaveBeenCalledTimes(1);
  expect(f.read).toHaveBeenCalledTimes(2);
});
it('throttles interaction and requires explicit continuation during the warning', async () => {
  const f = fixture();
  await f.monitor.sync();
  await f.monitor.interact();
  await f.monitor.interact();
  expect(f.read).toHaveBeenCalledTimes(2);
  f.advance(840_000);
  await f.monitor.interact();
  expect(f.read).toHaveBeenCalledTimes(2);
  await f.monitor.sync(true);
  f.monitor.tick();
  expect(f.update.mock.lastCall?.[0].seconds).toBe(900);
});
it('offline and background time still expire on return', async () => {
  const f = fixture();
  await f.monitor.sync();
  f.advance(901_000);
  f.monitor.tick();
  expect(f.expired).toHaveBeenCalledTimes(1);
});
it('failed continuation keeps the original deadline and exposes an error', async () => {
  const f = fixture();
  await f.monitor.sync();
  f.advance(840_000);
  f.read.mockRejectedValueOnce(new Error('offline'));
  await f.monitor.sync(true);
  expect(f.update.mock.lastCall?.[0]).toMatchObject({
    seconds: 60,
    error: expect.any(String),
  });
  f.advance(60_000);
  f.monitor.tick();
  expect(f.expired).toHaveBeenCalledOnce();
});
it('rejects a late reply after disposal or expiration', async () => {
  const f = fixture();
  let resolve: (value: Awaited<ReturnType<typeof f.read>>) => void = () => {};
  f.read.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const pending = f.monitor.sync();
  f.advance(900_000);
  f.monitor.tick();
  resolve({
    serverTime: new Date(0).toISOString(),
    idleExpiresAt: new Date(900_000).toISOString(),
    expiresAt: new Date(30 * 86400_000).toISOString(),
  });
  await pending;
  expect(f.expired).toHaveBeenCalledOnce();
  f.monitor.dispose();
  await f.monitor.sync();
  expect(f.read).toHaveBeenCalledTimes(1);
});
it('a restored session keeps its server deadline when the first check fails', async () => {
  let now = 0;
  const expired = vi.fn(),
    update = vi.fn();
  const monitor = createBuyerInactivity({
    now: () => now,
    expired,
    update,
    read: async () => {
      throw Error('offline');
    },
    initialState: {
      serverTime: new Date(0).toISOString(),
      idleExpiresAt: new Date(60_000).toISOString(),
      expiresAt: new Date(86400_000).toISOString(),
    },
  });
  await monitor.sync();
  monitor.tick();
  expect(update.mock.lastCall?.[0].seconds).toBe(60);
  now = 60_000;
  monitor.tick();
  expect(expired).toHaveBeenCalledOnce();
});
