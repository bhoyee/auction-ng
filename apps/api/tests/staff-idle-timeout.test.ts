import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { AuthService } from '../src/auth/auth-service';
import { hashStaffPassword } from '../src/auth/staff-crypto';
import { encryptPii, hashPii } from '../src/security/pii';
import { createApi } from '../src/app';

let clock = Date.now();
let auth: AuthService;
let app: Awaited<ReturnType<typeof createApi>>;
let baseUrl: string;
let encoded: string;
const password = 'Synthetic inactivity test password 42';
const codes = new Map<string, string>();
beforeAll(async () => {
  const databaseUrl = process.env.STAFF_ADMIN_TEST_DATABASE_URL;
  if (
    !databaseUrl ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(databaseUrl).pathname)
  )
    throw Error('Isolated staff session database required');
  const options = {
    databaseUrl,
    mode: 'local',
    now: () => clock,
    emailProvider: {
      async sendCode(email: string, code: string) {
        codes.set(email, code);
      },
    },
  };
  auth = new AuthService(options);
  encoded = await hashStaffPassword(password);
  app = await createApi(options);
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});
afterAll(async () => {
  await app?.close();
  await auth?.close();
});
async function account() {
  const email = randomUUID() + '@example.test',
    deviceId = randomUUID();
  await auth.db.user.create({
    data: {
      name: 'Synthetic idle staff',
      role: 'admin',
      emailVerifiedAt: new Date(clock),
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
      staffCredential: { create: { passwordHash: encoded } },
    },
  });
  const tokens = await auth.staffSignIn(
    { email, password, deviceId, client: 'web' },
    randomUUID(),
  );
  const identity = await auth.authenticate(tokens.accessToken, deviceId);
  return { tokens, identity, deviceId };
}
it('polling and refresh preserve inactivity expiry, reject revival at fifteen minutes and cap realtime access', async () => {
  const f = await account(),
    started = clock;
  clock += 14 * 60_000;
  const state = await auth.staffSession(f.identity);
  expect(Date.parse(state.idleExpiresAt)).toBe(started + 15 * 60_000);
  const next = await auth.refresh(
    { deviceId: f.deviceId, client: 'web' },
    f.tokens.refreshToken,
    randomUUID(),
    true,
  );
  const identity = await auth.authenticate(next.accessToken, f.deviceId);
  expect(Date.parse((await auth.realtimeSession(identity)).expiresAt)).toBe(
    started + 15 * 60_000,
  );
  clock = started + 15 * 60_000;
  await expect(
    auth.authenticate(next.accessToken, f.deviceId),
  ).rejects.toMatchObject({ status: 401 });
  await expect(auth.staffSession(identity, true)).rejects.toMatchObject({
    status: 401,
  });
  await expect(
    auth.refresh(
      { deviceId: f.deviceId, client: 'web' },
      next.refreshToken,
      randomUUID(),
      true,
    ),
  ).rejects.toMatchObject({ status: 401 });
});
it('accepted activity extends only the authenticated session family, survives rotation and never extends eight hours', async () => {
  const f = await account(),
    other = await account(),
    started = clock;
  clock += 13 * 60_000;
  const active = await auth.staffSession(f.identity, true);
  expect(Date.parse(active.idleExpiresAt)).toBe(clock + 15 * 60_000);
  expect(
    Date.parse((await auth.staffSession(other.identity)).idleExpiresAt),
  ).toBe(started + 15 * 60_000);
  const next = await auth.refresh(
    { deviceId: f.deviceId, client: 'web' },
    f.tokens.refreshToken,
    randomUUID(),
    true,
  );
  let identity = await auth.authenticate(next.accessToken, f.deviceId);
  expect((await auth.staffSession(identity)).idleExpiresAt).toBe(
    active.idleExpiresAt,
  );
  // Simulate successive accepted activity/rotations through the working day.
  let tokens = next;
  while (clock < started + 7 * 60 * 60_000 + 50 * 60_000) {
    clock += 10 * 60_000;
    await auth.staffSession(identity, true);
    tokens = await auth.refresh(
      { deviceId: f.deviceId, client: 'web' },
      tokens.refreshToken,
      randomUUID(),
      true,
    );
    identity = await auth.authenticate(tokens.accessToken, f.deviceId);
  }
  expect(Date.parse((await auth.staffSession(identity, true)).expiresAt)).toBe(
    started + 8 * 60 * 60_000,
  );
  clock = started + 8 * 60 * 60_000;
  await expect(auth.staffSession(identity, true)).rejects.toMatchObject({
    status: 401,
  });
  await expect(
    auth.refresh(
      { deviceId: f.deviceId, client: 'web' },
      tokens.refreshToken,
      randomUUID(),
      true,
    ),
  ).rejects.toMatchObject({ status: 401 });
});
it('activity and rotation serialize without losing accepted activity or reviving revoked sessions', async () => {
  const f = await account(),
    started = clock;
  clock += 13 * 60_000;
  const [activity, renewal] = await Promise.allSettled([
    auth.staffSession(f.identity, true),
    auth.refresh(
      { deviceId: f.deviceId, client: 'web' },
      f.tokens.refreshToken,
      randomUUID(),
      true,
    ),
  ]);
  expect(renewal.status).toBe('fulfilled');
  if (renewal.status !== 'fulfilled') throw Error('Rotation failed');
  const identity = await auth.authenticate(
    renewal.value.accessToken,
    f.deviceId,
  );
  const state = await auth.staffSession(identity);
  expect(Date.parse(state.idleExpiresAt)).toBe(
    started + (activity.status === 'fulfilled' ? 28 : 15) * 60_000,
  );
  await expect(auth.staffSession(f.identity, true)).rejects.toMatchObject({
    status: 401,
  });
});
it('buyer refresh remains available beyond the staff inactivity window', async () => {
  const email = randomUUID() + '@example.test',
    deviceId = randomUUID();
  const request = await auth.requestCode(
    {
      purpose: 'signup',
      name: 'Synthetic buyer',
      email,
      password,
      deviceId,
      client: 'web',
    },
    randomUUID(),
  );
  const tokens = await auth.verifyCode(
    {
      challengeId: request.challengeId,
      code: codes.get(email) ?? '',
      deviceId,
      client: 'web',
    },
    randomUUID(),
  );
  clock += 14 * 60_000;
  const next = await auth.refresh(
    { deviceId, client: 'web' },
    tokens.refreshToken,
    randomUUID(),
  );
  clock += 2 * 60_000;
  expect((await auth.authenticate(next.accessToken, deviceId)).user.role).toBe(
    'buyer',
  );
});
it('HTTP activity is strict, staff-only, origin-protected and server-timed; GET never extends it', async () => {
  const f = await account();
  const headers = {
    Authorization: `Bearer ${f.tokens.accessToken}`,
    'X-Device-Id': f.deviceId,
    'X-Auction-Client': 'web',
    Origin: auth.staffOrigins[0] ?? 'http://localhost:3301',
    'Content-Type': 'application/json',
  };
  const url = baseUrl + '/auth/staff/activity';
  expect(
    (
      await fetch(url, {
        method: 'POST',
        headers: { ...headers, Origin: 'https://untrusted.example.test' },
        body: '{}',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ lastActiveAt: '2099-01-01' }),
      })
    ).status,
  ).toBe(400);
  const response = await fetch(url, { method: 'POST', headers, body: '{}' });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const state = await response.json();
  expect(state.serverTime).toBe(new Date(clock).toISOString());
  expect(
    (await fetch(baseUrl + '/auth/staff/session', { headers })).status,
  ).toBe(200);
  expect(
    (
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    ).status,
  ).toBe(401);
  await expect(
    auth.staffSession(
      { ...f.identity, user: { ...f.identity.user, role: 'buyer' } },
      true,
    ),
  ).rejects.toMatchObject({ status: 403 });
});
