import { expect, it, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { createNativeSession } from '../apps/mobile/lib/native-session';
import { ApiError, createAuthClient } from '../packages/api-client/src/auth';
import type { TokenResponse } from '../packages/shared/src/auth-session-schemas';
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture() {
  let stored: string | null = null;
  const device = randomUUID();
  const user = {
    id: randomUUID(),
    name: 'Synthetic Buyer',
    role: 'buyer' as const,
    status: 'active' as const,
    email: 'buyer@example.test',
    emailVerified: true,
    phone: null,
    phoneVerified: false,
    address: null,
  };
  const token = (refresh = true): TokenResponse => ({
    accessToken: randomBytes(32).toString('base64url'),
    refreshToken: refresh ? randomBytes(32).toString('base64url') : undefined,
    expiresInSeconds: 900,
    user,
  });
  const refresh = vi.fn(async () => token()),
    logout = vi.fn(async () => {}),
    changed = vi.fn();
  const store = {
    read: async () => stored,
    write: vi.fn(async (value: string) => {
      stored = value;
    }),
    clear: vi.fn(async () => {
      stored = null;
    }),
  };
  const manager = createNativeSession({
    store,
    deviceId: () => device,
    auth: () => ({
      ...createAuthClient('https://api.example.test', {
        client: 'mobile',
        deviceId: device,
      }),
      refresh,
      logout,
    }),
    changed,
  });
  return {
    manager,
    store,
    changed,
    refresh,
    logout,
    token,
    get stored() {
      return stored;
    },
    device,
  };
}
it('persists only refresh identity, never the access token or profile', async () => {
  const f = fixture();
  await f.manager.restore();
  const token = f.token();
  await f.manager.signIn(token);
  const disk = JSON.parse(f.stored ?? '{}');
  expect(disk).toEqual({
    deviceId: f.device,
    refreshToken: token.refreshToken,
  });
  expect(f.stored).not.toContain(token.accessToken);
  expect(f.stored).not.toContain(token.user.email);
});
it('fails closed if secure persistence fails before publishing a login', async () => {
  const f = fixture();
  await f.manager.restore();
  f.store.write.mockRejectedValueOnce(Error('Secure store locked'));
  await expect(f.manager.signIn(f.token())).rejects.toThrow();
  expect(f.manager.session).toBeNull();
  expect(f.changed).not.toHaveBeenCalled();
});
it('renews once for concurrent expired-token reads and preserves exact work inputs', async () => {
  const f = fixture();
  await f.manager.restore();
  const old = f.token();
  await f.manager.signIn(old);
  const refresh = deferred<TokenResponse>();
  f.refresh.mockImplementationOnce(() => refresh.promise);
  const key = randomUUID(),
    fresh = f.token();
  const seen: string[] = [];
  const calls = Array.from({ length: 20 }, () =>
    f.manager.run(async (c) => {
      seen.push(key);
      if (c.accessToken === old.accessToken) throw new ApiError(401);
      return c.accessToken;
    }),
  );
  await new Promise((done) => setTimeout(done, 0));
  expect(f.refresh).toHaveBeenCalledTimes(1);
  refresh.resolve(fresh);
  expect(await Promise.all(calls)).toEqual(Array(20).fill(fresh.accessToken));
  expect(new Set(seen)).toEqual(new Set([key]));
});
it('keeps secure refresh identity when restoration fails temporarily offline', async () => {
  const f = fixture();
  await f.manager.restore();
  await f.manager.signIn(f.token());
  const previous = f.stored;
  f.refresh.mockRejectedValueOnce(Error('offline'));
  await expect(f.manager.renew()).rejects.toThrow('offline');
  expect(f.stored).toBe(previous);
  expect(f.store.clear).not.toHaveBeenCalled();
});
it('does not restore a session when an earlier refresh finishes after logout', async () => {
  const f = fixture();
  await f.manager.restore();
  await f.manager.signIn(f.token());
  const refresh = deferred<TokenResponse>();
  f.refresh.mockImplementationOnce(() => refresh.promise);
  const pending = f.manager.renew();
  await f.manager.logout();
  refresh.resolve(f.token());
  expect(await pending).toBeNull();
  expect(f.manager.session).toBeNull();
  expect(f.stored).toBeNull();
});
it('rejects financial work bound to a different signed-in buyer', async () => {
  const f = fixture();
  await f.manager.restore();
  await f.manager.signIn(f.token());
  const work = vi.fn(async () => true);
  await expect(f.manager.run(work, randomUUID())).rejects.toMatchObject({
    status: 401,
  });
  expect(work).not.toHaveBeenCalled();
});
it('discards a private response that returns after logout', async () => {
  const f = fixture();
  await f.manager.restore();
  await f.manager.signIn(f.token());
  const result = deferred<string>();
  const pending = f.manager.run(() => result.promise);
  await f.manager.logout();
  result.resolve('private');
  await expect(pending).rejects.toMatchObject({ status: 401 });
});
