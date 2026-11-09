import { afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
const mocks = vi.hoisted(() => ({ io: vi.fn() }));
vi.mock('../packages/api-client/node_modules/socket.io-client', () => ({
  io: mocks.io,
}));
import {
  acquireStaffRealtime,
  subscribeStaffActivity,
} from '../packages/api-client/src/staff-realtime';

class TestSocket extends EventEmitter {
  connected = false;
  connect = vi.fn(() => {
    this.connected = true;
    this.emit('connect');
  });
  disconnect = vi.fn(() => {
    this.connected = false;
    this.emit('disconnect');
  });
}
const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((fn) => fn());
  vi.useRealTimers();
  vi.clearAllMocks();
});
it('reconnects after a server-side availability interruption but not after session expiry', async () => {
  vi.useFakeTimers();
  mockSockets();
  const connection = acquireStaffRealtime(url, credentials);
  disposers.push(connection.release);
  connection.connect();
  const socket = connection.socket as unknown as TestSocket;
  socket.connected = false;
  socket.emit('disconnect', 'io server disconnect');
  await vi.advanceTimersByTimeAsync(1000);
  expect(socket.connect).toHaveBeenCalledTimes(2);
  socket.emit('session:expired');
  socket.connected = false;
  socket.emit('disconnect', 'io server disconnect');
  await vi.advanceTimersByTimeAsync(2000);
  expect(socket.connect).toHaveBeenCalledTimes(2);
});
it('cancels a scheduled reconnect when the last subscriber leaves', async () => {
  vi.useFakeTimers();
  mockSockets();
  const connection = acquireStaffRealtime(url, credentials);
  disposers.push(connection.release);
  connection.connect();
  const socket = connection.socket as unknown as TestSocket;
  socket.connected = false;
  socket.emit('disconnect', 'io server disconnect');
  connection.release();
  await vi.advanceTimersByTimeAsync(2000);
  expect(socket.connect).toHaveBeenCalledOnce();
});
const credentials = {
  accessToken: 'a'.repeat(43),
  deviceId: '892611af-c236-4461-a43d-a29fed4d1c2a',
};
const url = 'http://localhost:4001';
function mockSockets() {
  mocks.io.mockImplementation(() => new TestSocket());
}

it('shares one transport between the staff bell and monitor without removing other listeners', () => {
  mockSockets();
  const bell = vi.fn(),
    status = vi.fn();
  const stopBell = subscribeStaffActivity(url, credentials, bell, status);
  disposers.push(stopBell);
  const monitor = acquireStaffRealtime(url, credentials);
  disposers.push(monitor.release);
  const socket = monitor.socket as unknown as TestSocket;
  const update = vi.fn();
  socket.on('lot:update', update);
  expect(mocks.io).toHaveBeenCalledTimes(1);
  expect(status).toHaveBeenLastCalledWith(true);
  socket.emit('staff:changed');
  expect(bell).toHaveBeenCalledTimes(2);
  stopBell();
  expect(socket.disconnect).not.toHaveBeenCalled();
  socket.emit('lot:update');
  expect(update).toHaveBeenCalledOnce();
  monitor.release();
  monitor.release();
  expect(socket.disconnect).toHaveBeenCalledOnce();
  expect(socket.listenerCount('lot:update')).toBe(0);
});

it('isolates token rotation and devices and releases obsolete connections', () => {
  mockSockets();
  const first = acquireStaffRealtime(url, credentials);
  const rotated = acquireStaffRealtime(url, {
    ...credentials,
    accessToken: 'b'.repeat(43),
  });
  const device = acquireStaffRealtime(url, {
    ...credentials,
    deviceId: 'f1be04be-3bf3-466c-95f2-427b9cbf118b',
  });
  disposers.push(first.release, rotated.release, device.release);
  expect(mocks.io).toHaveBeenCalledTimes(3);
  first.release();
  expect(
    (first.socket as unknown as TestSocket).disconnect,
  ).toHaveBeenCalledOnce();
  expect(
    (rotated.socket as unknown as TestSocket).disconnect,
  ).not.toHaveBeenCalled();
});

it('resyncs each subscriber on reconnect and reports loss without creating a second socket', () => {
  mockSockets();
  const change = vi.fn(),
    status = vi.fn();
  const stop = subscribeStaffActivity(url, credentials, change, status);
  const monitor = acquireStaffRealtime(url, credentials);
  disposers.push(stop, monitor.release);
  const socket = monitor.socket as unknown as TestSocket;
  socket.disconnect();
  expect(status).toHaveBeenLastCalledWith(false);
  socket.connect();
  expect(status).toHaveBeenLastCalledWith(true);
  expect(change).toHaveBeenCalledTimes(2);
  expect(mocks.io).toHaveBeenCalledOnce();
});
