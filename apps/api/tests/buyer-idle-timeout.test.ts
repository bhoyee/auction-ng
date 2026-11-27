import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { AuthService } from '../src/auth/auth-service';
import { createApi } from '../src/app';

let clock = Date.now();
let auth: AuthService;
let app: Awaited<ReturnType<typeof createApi>>;
let base: string;
const inbox = new Map<string, string>();
beforeAll(async () => {
  const databaseUrl = process.env.BUYER_IDLE_TEST_DATABASE_URL;
  if (
    !databaseUrl ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(databaseUrl).pathname)
  )
    throw Error('Isolated buyer session database required');
  const options = {
    databaseUrl,
    mode: 'local',
    now: () => clock,
    emailProvider: {
      async sendCode(email: string, code: string) {
        inbox.set(email, code);
      },
    },
  };
  auth = new AuthService(options);
  auth.beforeSessionRevocation = async () => {};
  await auth.db.bidEngineRuntime.create({
    data: {
      namespace: `test:buyer-idle:${randomUUID()}:`,
      redisRunId: 'synthetic',
    },
  });
  app = await createApi(options);
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
afterAll(async () => {
  await app?.close();
  await auth?.close();
});
async function account(client: 'web' | 'mobile' = 'web') {
  const email = randomUUID() + '@example.test',
    deviceId = randomUUID();
  const requested = await auth.requestCode(
    {
      purpose: 'signup',
      email,
      name: 'Synthetic buyer',
      password: 'Synthetic buyer session password 42',
      client,
      deviceId,
    },
    randomUUID(),
  );
  const tokens = await auth.verifyCode(
    {
      challengeId: requested.challengeId,
      code: inbox.get(email) ?? '',
      deviceId,
      client,
    },
    randomUUID(),
  );
  return {
    tokens,
    identity: await auth.authenticate(tokens.accessToken, deviceId),
    deviceId,
    client,
  };
}
it('expires buyers at fifteen minutes despite polling, sockets and refresh, and preserves the deadline across rotation', async () => {
  const f = await account(),
    started = clock;
  clock += 14 * 60_000;
  expect(Date.parse((await auth.buyerSession(f.identity)).idleExpiresAt)).toBe(
    started + 15 * 60_000,
  );
  const next = await auth.refresh(
    f.client === 'mobile'
      ? {
          deviceId: f.deviceId,
          client: 'mobile',
          refreshToken: f.tokens.refreshToken,
        }
      : { deviceId: f.deviceId, client: 'web' },
    f.tokens.refreshToken,
    randomUUID(),
  );
  const identity = await auth.authenticate(next.accessToken, f.deviceId);
  expect(Date.parse((await auth.realtimeSession(identity)).expiresAt)).toBe(
    started + 15 * 60_000,
  );
  clock = started + 15 * 60_000;
  await expect(
    auth.authenticate(next.accessToken, f.deviceId),
  ).rejects.toMatchObject({ status: 401 });
  await expect(auth.buyerSession(identity, true)).rejects.toMatchObject({
    status: 401,
  });
  await expect(
    auth.refresh(
      f.client === 'mobile'
        ? {
            deviceId: f.deviceId,
            client: 'mobile',
            refreshToken: f.tokens.refreshToken,
          }
        : { deviceId: f.deviceId, client: 'web' },
      next.refreshToken,
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 401 });
});
it('counts only accepted activity and cannot revive an expired or revoked buyer session', async () => {
  const f = await account('mobile'),
    started = clock;
  const originalExpiry = (await auth.buyerSession(f.identity)).expiresAt;
  clock += 13 * 60_000;
  const active = await auth.buyerSession(f.identity, true);
  expect(Date.parse(active.idleExpiresAt)).toBe(started + 28 * 60_000);
  const next = await auth.refresh(
    f.client === 'mobile'
      ? {
          deviceId: f.deviceId,
          client: 'mobile',
          refreshToken: f.tokens.refreshToken,
        }
      : { deviceId: f.deviceId, client: 'web' },
    f.tokens.refreshToken,
    randomUUID(),
  );
  const identity = await auth.authenticate(next.accessToken, f.deviceId);
  expect((await auth.buyerSession(identity)).expiresAt).toBe(originalExpiry);
  expect((await auth.buyerSession(identity)).idleExpiresAt).toBe(
    active.idleExpiresAt,
  );
  await expect(auth.buyerSession(f.identity, true)).rejects.toMatchObject({
    status: 401,
  });
  clock = started + 28 * 60_000;
  await expect(auth.buyerSession(identity, true)).rejects.toMatchObject({
    status: 401,
  });
});
it('rate limits activity independently of sign-in and rejects refreshing after the original absolute deadline', async () => {
  const f = await account();
  const ip = randomUUID();
  for (let i = 0; i < 60; i++)
    await auth.buyerSessionRate(f.identity.user.id, ip);
  await expect(
    auth.buyerSessionRate(f.identity.user.id, ip),
  ).rejects.toMatchObject({ status: 429 });
  await auth.db.authSession.update({
    where: { id: f.identity.sessionId },
    data: { expiresAt: new Date(clock + 60_000) },
  });
  expect(
    Date.parse((await auth.buyerSession(f.identity, true)).idleExpiresAt),
  ).toBe(clock + 60_000);
  clock += 60_000;
  await expect(
    auth.refresh(
      f.client === 'mobile'
        ? {
            deviceId: f.deviceId,
            client: 'mobile',
            refreshToken: f.tokens.refreshToken,
          }
        : { deviceId: f.deviceId, client: 'web' },
      f.tokens.refreshToken,
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 401 });
});
it('serializes activity and token rotation without losing an accepted update', async () => {
  const f = await account(),
    started = clock;
  clock += 13 * 60_000;
  const [activity, rotation] = await Promise.allSettled([
    auth.buyerSession(f.identity, true),
    auth.refresh(
      f.client === 'mobile'
        ? {
            deviceId: f.deviceId,
            client: 'mobile',
            refreshToken: f.tokens.refreshToken,
          }
        : { deviceId: f.deviceId, client: 'web' },
      f.tokens.refreshToken,
      randomUUID(),
    ),
  ]);
  expect(rotation.status).toBe('fulfilled');
  if (rotation.status !== 'fulfilled') throw Error('Rotation failed');
  const identity = await auth.authenticate(
    rotation.value.accessToken,
    f.deviceId,
  );
  expect(Date.parse((await auth.buyerSession(identity)).idleExpiresAt)).toBe(
    started + (activity.status === 'fulfilled' ? 28 : 15) * 60_000,
  );
});
it('checks buyer role, web origin, device and strict server-timed HTTP activity; supports mobile', async () => {
  const f = await account();
  const headers = {
    Authorization: `Bearer ${f.tokens.accessToken}`,
    'X-Device-Id': f.deviceId,
    'X-Auction-Client': 'web',
    Origin: auth.origins[0] ?? 'http://localhost:3300',
    'Content-Type': 'application/json',
  };
  const send = (body: unknown, extra = {}) =>
    fetch(base + '/auth/activity', {
      method: 'POST',
      headers: { ...headers, ...extra },
      body: JSON.stringify(body),
    });
  expect(
    (await send({}, { Origin: 'https://untrusted.example.test' })).status,
  ).toBe(403);
  expect((await send({ lastActiveAt: '2099-01-01' })).status).toBe(400);
  expect((await send({}, { 'X-Device-Id': randomUUID() })).status).toBe(401);
  const result = await send({});
  expect(result.status).toBe(200);
  expect(result.headers.get('cache-control')).toBe('no-store');
  expect((await result.json()).serverTime).toBe(new Date(clock).toISOString());
  expect((await fetch(base + '/auth/session', { headers })).status).toBe(200);
  await expect(
    auth.buyerSession(
      { ...f.identity, user: { ...f.identity.user, role: 'admin' } },
      true,
    ),
  ).rejects.toMatchObject({ status: 403 });
  const mobile = await account('mobile');
  expect(
    (
      await fetch(base + '/auth/activity', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mobile.tokens.accessToken}`,
          'X-Device-Id': mobile.deviceId,
          'Content-Type': 'application/json',
        },
        body: '{}',
      })
    ).status,
  ).toBe(200);
});
