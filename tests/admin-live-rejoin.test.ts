import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ acquire: vi.fn() }));
vi.mock('../packages/api-client/src/staff-realtime', () => ({
  acquireStaffRealtime: mocks.acquire,
}));
import { connectStaffLive } from '../packages/api-client/src/staff-live';

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
it('retries a failed room join on the existing socket and cancels retries on disposal', async () => {
  vi.useFakeTimers();
  const socket = Object.assign(new EventEmitter(), {
    connected: true,
    timeout: vi.fn(),
    emitWithAck: vi
      .fn()
      .mockRejectedValueOnce(Error('temporary interruption'))
      .mockResolvedValue({ ok: true, serverTime: new Date().toISOString() }),
  });
  socket.timeout.mockReturnValue(socket);
  const release = vi.fn();
  mocks.acquire.mockReturnValue({ socket, release, connect: vi.fn() });
  const status = vi.fn(),
    changed = vi.fn();
  const live = connectStaffLive(
    'http://localhost:4001',
    { accessToken: 'test', deviceId: 'test' },
    { status, changed, patch: vi.fn() },
  );
  await vi.advanceTimersByTimeAsync(2000);
  expect(socket.emitWithAck).toHaveBeenCalledTimes(2);
  expect(status).toHaveBeenLastCalledWith(true);
  expect(changed).toHaveBeenCalledOnce();
  socket.emit('admin:live:lot', {
    lotId: '10000000-0000-4000-8000-000000000001',
    currentPriceKobo: 9200000,
    endsAt: new Date(Date.now() + 60000).toISOString(),
    streamId: '2-0',
    serverTime: new Date().toISOString(),
    leading: null,
  });
  expect(changed).toHaveBeenCalledTimes(2);
  expect(mocks.acquire).toHaveBeenCalledOnce();
  live.close();
  await vi.advanceTimersByTimeAsync(10000);
  expect(socket.emitWithAck).toHaveBeenCalledTimes(2);
  expect(release).toHaveBeenCalledOnce();
});
