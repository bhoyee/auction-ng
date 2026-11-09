import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ io: vi.fn() }));
vi.mock('../packages/api-client/node_modules/socket.io-client', () => ({
  io: mocks.io,
}));
import { createRealtimeClient } from '../packages/api-client/src/realtime';
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
it('resynchronises an individually paused lot while the marketplace remains live', async () => {
  vi.useFakeTimers();
  const lotId = '10000000-0000-4000-8000-000000000001';
  let paused = false;
  const socket = Object.assign(new EventEmitter(), {
    connected: true,
    connect: vi.fn(),
    disconnect: vi.fn(),
    timeout: vi.fn(),
    emitWithAck: vi.fn(),
  });
  socket.timeout.mockReturnValue(socket);
  socket.emitWithAck.mockImplementation(async () => ({
    ok: true,
    lot: {
      lotId,
      currentPriceKobo: 50000,
      streamId: '1-0',
      endsAt: new Date(Date.now() + 60000).toISOString(),
      serverTime: new Date().toISOString(),
      isLeader: false,
      ...(paused ? { pausedAt: Date.now() } : {}),
    },
  }));
  mocks.io.mockReturnValue(socket);
  const client = createRealtimeClient('http://localhost:4001', {});
  try {
    client.watchLot(lotId);
    await vi.advanceTimersByTimeAsync(0);
    socket.emit('auction:control', {
      paused: false,
      serverTime: new Date().toISOString(),
    });
    await vi.advanceTimersByTimeAsync(0);
    paused = true;
    socket.emit('lot:control', { lotId });
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getSnapshot(lotId).lot?.pausedAt).toBeDefined();
    expect(client.getControlSnapshot()?.paused).toBe(false);
    paused = false;
    socket.emit('lot:control', { lotId });
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getSnapshot(lotId).lot?.pausedAt).toBeUndefined();
  } finally {
    client.close();
  }
});
it('publishes global pause state with no watched lots and keeps reconnect state honest', () => {
  const socket = Object.assign(new EventEmitter(), {
    connected: true,
    connect: vi.fn(),
    disconnect: vi.fn(),
    timeout: vi.fn(),
    emitWithAck: vi.fn(),
  });
  mocks.io.mockReturnValue(socket);
  const client = createRealtimeClient('http://localhost:4001', {}),
    changed = vi.fn();
  client.subscribe(changed);
  try {
    client.connect();
    expect(client.getControlSnapshot()).toBeNull();
    const event = {
      paused: true,
      revision: 'a'.repeat(64),
      serverTime: new Date().toISOString(),
    };
    socket.emit('auction:control', event);
    expect(client.getControlSnapshot()).toEqual({
      paused: true,
      revision: event.revision,
      connected: true,
    });
    expect(changed).toHaveBeenCalled();
    const previous = client.getControlSnapshot();
    socket.emit('auction:control', event);
    expect(client.getControlSnapshot()).toBe(previous);
    socket.emit('realtime:unavailable');
    expect(client.getControlSnapshot()).toMatchObject({
      paused: true,
      connected: false,
    });
    socket.emit('auction:control', event);
    expect(client.getControlSnapshot()).toMatchObject({
      paused: true,
      connected: true,
    });
    socket.emit('auction:control', {
      ...event,
      paused: false,
      revision: 'b'.repeat(64),
    });
    expect(client.getControlSnapshot()).toMatchObject({
      paused: false,
      connected: true,
    });
  } finally {
    client.close();
  }
});
it('disables immediately on a pause signal and rejects a delayed pre-pause snapshot', async () => {
  vi.useFakeTimers();
  const lotId = '10000000-0000-4000-8000-000000000001';
  const lot = {
    lotId,
    currentPriceKobo: 50000,
    streamId: '1-0',
    endsAt: new Date(Date.now() + 60000).toISOString(),
    serverTime: new Date().toISOString(),
    isLeader: false,
  };
  const pending: ((value: unknown) => void)[] = [];
  const socket = Object.assign(new EventEmitter(), {
    connected: true,
    connect: vi.fn(),
    disconnect: vi.fn(),
    timeout: vi.fn(),
    emitWithAck: vi.fn(() => new Promise((resolve) => pending.push(resolve))),
  });
  socket.timeout.mockReturnValue(socket);
  mocks.io.mockReturnValue(socket);
  const client = createRealtimeClient('http://localhost:4001', {});
  try {
    client.watchLot(lotId);
    socket.emit('auction:control', {
      paused: true,
      revision: 'a'.repeat(64),
      serverTime: new Date().toISOString(),
    });
    expect(client.getSnapshot(lotId).status).not.toBe('live');
    pending[0]?.({ ok: true, lot });
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getSnapshot(lotId).status).not.toBe('live');
    pending[1]?.({ ok: true, lot: { ...lot, pausedAt: Date.now() } });
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getSnapshot(lotId).lot?.pausedAt).toBeDefined();
    socket.emit('lot:update', lot);
    expect(client.getSnapshot(lotId).lot?.pausedAt).toBeDefined();
  } finally {
    client.close();
  }
});
it('keeps buyer countdowns frozen and resynchronises on a global control signal', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-08T12:00:00Z'));
  const lotId = '10000000-0000-4000-8000-000000000001',
    pausedAt = Date.now();
  let paused = true;
  const socket = Object.assign(new EventEmitter(), {
    connected: true,
    connect: vi.fn(),
    disconnect: vi.fn(),
    timeout: vi.fn(),
    emitWithAck: vi.fn(),
  });
  socket.timeout.mockReturnValue(socket);
  socket.emitWithAck.mockImplementation(async () => ({
    ok: true,
    lot: {
      lotId,
      currentPriceKobo: 50000,
      streamId: '1-0',
      endsAt: new Date(pausedAt + 60000).toISOString(),
      serverTime: new Date().toISOString(),
      isLeader: false,
      ...(paused ? { pausedAt } : {}),
    },
  }));
  mocks.io.mockReturnValue(socket);
  const client = createRealtimeClient('http://localhost:4001', {});
  try {
    client.watchLot(lotId);
    await vi.advanceTimersByTimeAsync(0);
    expect(Date.now() + client.getSnapshot(lotId).clockOffsetMs).toBe(pausedAt);
    await vi.advanceTimersByTimeAsync(5000);
    expect(Date.now() + client.getSnapshot(lotId).clockOffsetMs).toBe(pausedAt);
    paused = false;
    socket.emit('auction:control', {
      paused: false,
      serverTime: new Date().toISOString(),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getSnapshot(lotId).lot?.pausedAt).toBeUndefined();
    expect(socket.emitWithAck).toHaveBeenCalledTimes(2);
    socket.emit('auction:control', {
      paused: false,
      serverTime: new Date().toISOString(),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.emitWithAck).toHaveBeenCalledTimes(2);
  } finally {
    client.close();
  }
});
