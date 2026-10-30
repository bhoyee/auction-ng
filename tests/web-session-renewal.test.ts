import { expect, it, vi } from 'vitest';
import { createSessionRenewal } from '../apps/web/lib/session-renewal';
import type { TokenResponse } from '../packages/shared/src/auth-session-schemas';

const token = (accessToken: string): TokenResponse => ({
  accessToken,
  expiresInSeconds: 900,
  user: {
    id: 'buyer',
    name: 'Buyer',
    email: 'buyer@example.test',
    role: 'buyer',
    status: 'active',
    emailVerified: true,
    phoneVerified: false,
    phone: null,
    address: null,
    passwordSet: true,
  },
});
function fixture() {
  let current: TokenResponse | null = token('old'),
    version = 0;
  const apply = (value: TokenResponse | null) => {
    current = value;
    version++;
  };
  const refresh = vi.fn(async () => token('new'));
  const announce = vi.fn();
  const renew = createSessionRenewal({
    current: () => current,
    version: () => version,
    apply,
    refresh,
    announce,
    lock: (run) => run(),
  });
  return { renew, refresh, announce, apply, current: () => current };
}
it('coalesces simultaneous expired-token reads into one refresh', async () => {
  const f = fixture();
  const results = await Promise.all(
    Array.from({ length: 10 }, () => f.renew('old')),
  );
  expect(f.refresh).toHaveBeenCalledTimes(1);
  expect(results.every((value) => value?.accessToken === 'new')).toBe(true);
  expect(f.announce).toHaveBeenCalledTimes(1);
});
it('uses an already-renewed token instead of rotating it again', async () => {
  const f = fixture();
  f.apply(token('other-tab'));
  expect((await f.renew('old'))?.accessToken).toBe('other-tab');
  expect(f.refresh).not.toHaveBeenCalled();
});
it('does not restore a session after logout while refresh is pending', async () => {
  const f = fixture();
  let finish: ((value: TokenResponse) => void) | undefined;
  f.refresh.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = f.renew('old');
  f.apply(null);
  finish?.(token('new'));
  expect(await pending).toBeNull();
  expect(f.current()).toBeNull();
});
it('keeps a newer cross-tab token when an earlier request completes late', async () => {
  const f = fixture();
  let finish: ((value: TokenResponse) => void) | undefined;
  f.refresh.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = f.renew('old');
  f.apply(token('latest'));
  finish?.(token('older'));
  expect((await pending)?.accessToken).toBe('latest');
});
it('retains the session on a transient error and permits a later retry', async () => {
  const f = fixture();
  f.refresh.mockRejectedValueOnce(new Error('network'));
  await expect(f.renew('old')).rejects.toThrow('network');
  expect(f.current()?.accessToken).toBe('old');
  expect((await f.renew('old'))?.accessToken).toBe('new');
});
it('does not replace the current buyer with a different cookie owner', async () => {
  const f = fixture();
  const next = token('new');
  f.refresh.mockResolvedValue({
    ...next,
    user: { ...next.user, id: 'different' },
  });
  expect(await f.renew('old')).toBeNull();
  expect(f.current()).toBeNull();
});
it('supports initial cookie refresh without an existing access token', async () => {
  const f = fixture();
  f.apply(null);
  expect((await f.renew())?.accessToken).toBe('new');
});
it('ignores a late failed refresh after a newer sign-in', async () => {
  const f = fixture();
  let fail: ((cause: Error) => void) | undefined;
  f.refresh.mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
  );
  const pending = f.renew('old');
  f.apply(token('signed-in-again'));
  fail?.(new Error('expired old session'));
  expect((await pending)?.accessToken).toBe('signed-in-again');
});
it('rechecks the session after waiting for the browser refresh lock', async () => {
  let current: TokenResponse | null = token('old'),
    version = 0;
  let unlock: (() => void) | undefined;
  const refresh = vi.fn(async () => token('unused'));
  const renew = createSessionRenewal({
    current: () => current,
    version: () => version,
    apply: (value) => {
      current = value;
      version++;
    },
    refresh,
    announce: vi.fn(),
    lock: async (run) => {
      await new Promise<void>((resolve) => {
        unlock = resolve;
      });
      return run();
    },
  });
  const pending = renew('old');
  current = token('latest');
  version++;
  unlock?.();
  expect((await pending)?.accessToken).toBe('latest');
  expect(refresh).not.toHaveBeenCalled();
});
