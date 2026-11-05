import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { startReadLoop } from '../apps/mobile/lib/read-loop';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
it('polls while focused and stops all future requests when disposed on blur', async () => {
  const load = vi.fn().mockResolvedValue({ version: 1 });
  const loop = startReadLoop({
    load,
    onValue: vi.fn(),
    onError: vi.fn(),
    canRead: () => true,
    interval: 5000,
  });
  await vi.advanceTimersByTimeAsync(5000);
  expect(load).toHaveBeenCalledTimes(2);
  loop.dispose();
  await vi.advanceTimersByTimeAsync(20000);
  await loop.refresh();
  expect(load).toHaveBeenCalledTimes(2);
});
it('does not fetch an inactive history tab', async () => {
  const load = vi.fn();
  const loop = startReadLoop({
    load,
    onValue: vi.fn(),
    onError: vi.fn(),
    canRead: () => true,
    interval: 5000,
    enabled: false,
  });
  await vi.advanceTimersByTimeAsync(20000);
  await loop.refresh();
  expect(load).not.toHaveBeenCalled();
});
it('ignores a response that arrives after leaving the screen', async () => {
  let resolve: (value: string) => void = () => {};
  const load = () =>
    new Promise<string>((done) => {
      resolve = done;
    });
  const onValue = vi.fn();
  const loop = startReadLoop({
    load,
    onValue,
    onError: vi.fn(),
    canRead: () => true,
    interval: 5000,
  });
  loop.dispose();
  resolve('late private response');
  await vi.advanceTimersByTimeAsync(0);
  expect(onValue).not.toHaveBeenCalled();
});
it('does not overlap slow requests and resumes after backgrounding', async () => {
  let foreground = false;
  let resolve: (value: string) => void = () => {};
  const load = vi.fn(
    () =>
      new Promise<string>((done) => {
        resolve = done;
      }),
  );
  const loop = startReadLoop({
    load,
    onValue: vi.fn(),
    onError: vi.fn(),
    canRead: () => foreground,
    interval: 5000,
  });
  await vi.advanceTimersByTimeAsync(10000);
  expect(load).not.toHaveBeenCalled();
  foreground = true;
  void loop.refresh();
  await vi.advanceTimersByTimeAsync(10000);
  expect(load).toHaveBeenCalledTimes(1);
  resolve('confirmed');
  await vi.advanceTimersByTimeAsync(5000);
  expect(load).toHaveBeenCalledTimes(2);
  loop.dispose();
});
it('reports a failed refresh without replacing the last confirmed value', async () => {
  const onValue = vi.fn(),
    onError = vi.fn();
  const failure = new Error('synthetic failure');
  const load = vi
    .fn()
    .mockResolvedValueOnce({ version: 1 })
    .mockRejectedValue(failure);
  startReadLoop({
    load,
    onValue,
    onError,
    canRead: () => true,
    interval: 5000,
  });
  await vi.advanceTimersByTimeAsync(5000);
  expect(onValue).toHaveBeenCalledExactlyOnceWith({ version: 1 });
  expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
});
