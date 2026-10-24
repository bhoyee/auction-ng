import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createApi } from '../apps/api/src/app';
import { AuthService } from '../apps/api/src/auth/auth-service';
import type { EmailProvider } from '../apps/api/src/auth/email-provider';
import { createAuthClient } from '../packages/api-client/src/auth';
import {
  normalizeNigerianPhone,
  emailSchema,
} from '../packages/shared/src/auth-schemas';
import { decryptPii, hashPii } from '../apps/api/src/security/pii';

const inbox = new Map<string, string>();
const provider: EmailProvider = {
  async sendCode(email, code) {
    inbox.set(email, code);
  },
};
let now = Date.now();
let app: Awaited<ReturnType<typeof createApi>>;
let auth: AuthService;
let baseUrl: string;
const deviceId = randomUUID();
const device = { client: 'mobile' as const, deviceId };
let sequence = 0;
function email() {
  return `buyer-${++sequence}@example.test`;
}
function code(address: string) {
  const value = inbox.get(address);
  if (!value) throw new Error('Missing test email.');
  return value;
}
async function login() {
  const address = email();
  const request = await auth.requestCode(
    { email: address, ...device },
    randomUUID(),
  );
  return auth.verifyCode(
    { ...device, challengeId: request.challengeId, code: code(address) },
    randomUUID(),
  );
}
beforeAll(async () => {
  const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
  if (
    !databaseUrl ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(databaseUrl).pathname)
  )
    throw new Error('Isolated authentication test database required.');
  app = await createApi({
    databaseUrl,
    emailProvider: provider,
    mode: 'local',
    now: () => now,
  });
  auth = app.get(AuthService);
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});
afterAll(async () => {
  await app?.close();
});
it('normalizes Nigerian phones and email without inventing verification', () => {
  expect(normalizeNigerianPhone('0803 123 4567')).toBe('+2348031234567');
  expect(normalizeNigerianPhone('+2348031234567')).toBe('+2348031234567');
  expect(() => normalizeNigerianPhone('1234')).toThrow();
  expect(emailSchema.parse(' Buyer@Example.Test ')).toBe('buyer@example.test');
  expect(emailSchema.safeParse('bad\r\nBcc: other@example.test').success).toBe(
    false,
  );
});
it('signs up and logs in through the mobile typed client with encrypted email and no verified phone', async () => {
  const address = email();
  const client = createAuthClient(baseUrl, device);
  const challenge = await client.requestCode(address);
  expect(challenge).not.toHaveProperty('code');
  const session = await client.verifyCode(challenge.challengeId, code(address));
  expect(session.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(session.user).toMatchObject({
    email: address,
    emailVerified: true,
    phone: null,
    phoneVerified: false,
    role: 'buyer',
  });
  expect(await client.getProfile(session.accessToken)).toEqual(session.user);
  expect(
    (await client.updateProfile(session.accessToken, 'Chiamaka')).name,
  ).toBe('Chiamaka');
  const saved = await auth.db.user.findUniqueOrThrow({
    where: { id: session.user.id },
  });
  expect(Buffer.from(saved.emailCiphertext ?? []).toString()).not.toContain(
    address,
  );
  expect(saved.phoneVerifiedAt).toBeNull();
  expect(
    await auth.db.auditLog.count({
      where: { actorId: saved.id, action: 'profile.update' },
    }),
  ).toBe(1);
  const again = await client.requestCode(address);
  expect(
    (await client.verifyCode(again.challengeId, code(address))).user.id,
  ).toBe(saved.id);
});
it('uses HttpOnly web cookies without returning the refresh token and rejects CSRF', async () => {
  const address = email();
  const headers = {
    'Content-Type': 'application/json',
    Origin: 'http://localhost:3300',
    'X-Auction-Client': 'web',
  };
  const web = { client: 'web', deviceId: randomUUID() };
  const request = await fetch(`${baseUrl}/auth/request-code`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...web, email: address }),
  });
  expect(request.status).toBe(200);
  const challenge = (await request.json()) as { challengeId: string };
  const verified = await fetch(`${baseUrl}/auth/verify-code`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...web,
      challengeId: challenge.challengeId,
      code: code(address),
    }),
  });
  expect(verified.status).toBe(200);
  expect(await verified.json()).not.toHaveProperty('refreshToken');
  const cookie = verified.headers.get('set-cookie') ?? '';
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('SameSite=Strict');
  expect(cookie).toContain('Path=/auth');
  const cookies = cookie.split(';')[0] ?? '';
  const refreshed = await fetch(`${baseUrl}/auth/refresh`, {
    method: 'POST',
    headers: { ...headers, Cookie: cookies },
    body: JSON.stringify(web),
  });
  expect(refreshed.status).toBe(200);
  expect(refreshed.headers.get('set-cookie')).not.toBe(cookie);
  const csrf = await fetch(`${baseUrl}/auth/refresh`, {
    method: 'POST',
    headers: { ...headers, Origin: 'https://attacker.test', Cookie: cookies },
    body: JSON.stringify(web),
  });
  expect(csrf.status).toBe(403);
  expect(
    (
      await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookies },
        body: JSON.stringify(web),
      })
    ).status,
  ).toBe(403);
});
it('rejects wrong codes, device/client swaps, expired and reused codes', async () => {
  const address = email();
  const request = await auth.requestCode(
    { email: address, ...device },
    randomUUID(),
  );
  const valid = {
    ...device,
    challengeId: request.challengeId,
    code: code(address),
  };
  const wrong = valid.code === '000000' ? '111111' : '000000';
  await expect(
    auth.verifyCode({ ...valid, code: wrong }, randomUUID()),
  ).rejects.toThrow();
  await expect(
    auth.verifyCode({ ...valid, deviceId: randomUUID() }, randomUUID()),
  ).rejects.toThrow();
  await expect(
    auth.verifyCode({ ...valid, client: 'web' }, randomUUID()),
  ).rejects.toThrow();
  await auth.verifyCode(valid, randomUUID());
  await expect(auth.verifyCode(valid, randomUUID())).rejects.toThrow();
  const other = email();
  const expiry = await auth.requestCode(
    { email: other, ...device },
    randomUUID(),
  );
  now += 300000;
  await expect(
    auth.verifyCode(
      { ...device, challengeId: expiry.challengeId, code: code(other) },
      randomUUID(),
    ),
  ).rejects.toThrow();
});
it('locks a challenge after five wrong attempts and invalidates old codes on resend', async () => {
  const address = email();
  const request = await auth.requestCode(
    { email: address, ...device },
    randomUUID(),
  );
  const wrong = code(address) === '000000' ? '111111' : '000000';
  for (let n = 0; n < 5; n++)
    await expect(
      auth.verifyCode(
        { ...device, challengeId: request.challengeId, code: wrong },
        randomUUID(),
      ),
    ).rejects.toThrow();
  await expect(
    auth.verifyCode(
      { ...device, challengeId: request.challengeId, code: code(address) },
      randomUUID(),
    ),
  ).rejects.toThrow();
  const oldCode = code(address);
  await auth.requestCode({ email: address, ...device }, randomUUID());
  await expect(
    auth.verifyCode(
      { ...device, challengeId: request.challengeId, code: oldCode },
      randomUUID(),
    ),
  ).rejects.toThrow();
});
it('accepts an OTP only once under concurrent verification', async () => {
  const address = email();
  const request = await auth.requestCode(
    { email: address, ...device },
    randomUUID(),
  );
  const outcomes = await Promise.allSettled(
    Array.from({ length: 10 }, () =>
      auth.verifyCode(
        { ...device, challengeId: request.challengeId, code: code(address) },
        randomUUID(),
      ),
    ),
  );
  expect(
    outcomes.filter((outcome) => outcome.status === 'fulfilled'),
  ).toHaveLength(1);
  expect(
    await auth.db.user.count({
      where: { emailHash: hashPii(address, 'email') },
    }),
  ).toBe(1);
});
it('enforces per-email sending limits atomically under concurrent requests', async () => {
  const address = email();
  const outcomes = await Promise.allSettled(
    Array.from({ length: 10 }, () =>
      auth.requestCode({ email: address, ...device }, randomUUID()),
    ),
  );
  expect(
    outcomes.filter((outcome) => outcome.status === 'fulfilled'),
  ).toHaveLength(3);
  for (const outcome of outcomes)
    if (outcome.status === 'rejected')
      expect(outcome.reason.getStatus()).toBe(429);
});
it('rotates refresh tokens, rejects replay, and immediately revokes the family', async () => {
  const session = await login();
  const rotated = await auth.refresh(
    { ...device, refreshToken: session.refreshToken },
    session.refreshToken,
    randomUUID(),
  );
  expect(rotated.refreshToken).not.toBe(session.refreshToken);
  await expect(
    auth.authenticate(session.accessToken, deviceId),
  ).rejects.toThrow();
  await expect(
    auth.refresh(
      { ...device, refreshToken: session.refreshToken },
      session.refreshToken,
      randomUUID(),
    ),
  ).rejects.toThrow();
  await expect(
    auth.authenticate(rotated.accessToken, deviceId),
  ).rejects.toThrow();
  await expect(
    auth.refresh(
      { ...device, refreshToken: rotated.refreshToken },
      rotated.refreshToken,
      randomUUID(),
    ),
  ).rejects.toThrow();
});
it('expires access tokens, binds refresh to device and revokes sessions on logout', async () => {
  const session = await login();
  await expect(
    auth.authenticate(session.accessToken, randomUUID()),
  ).rejects.toThrow();
  await expect(
    auth.refresh(
      { ...device, deviceId: randomUUID(), refreshToken: session.refreshToken },
      session.refreshToken,
      randomUUID(),
    ),
  ).rejects.toThrow();
  now += 900000;
  await expect(
    auth.authenticate(session.accessToken, deviceId),
  ).rejects.toThrow();
  const rotated = await auth.refresh(
    { ...device, refreshToken: session.refreshToken },
    session.refreshToken,
    randomUUID(),
  );
  await auth.logout(
    { ...device, refreshToken: rotated.refreshToken },
    rotated.refreshToken,
    randomUUID(),
  );
  await expect(
    auth.authenticate(rotated.accessToken, deviceId),
  ).rejects.toThrow();
});
it('rejects unauthenticated profile requests, role escalation and unknown fields', async () => {
  expect((await fetch(`${baseUrl}/auth/profile`)).status).toBe(401);
  const session = await login();
  const response = await fetch(`${baseUrl}/auth/profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
      'X-Device-Id': deviceId,
    },
    body: JSON.stringify({ name: 'Buyer', role: 'admin', phoneVerified: true }),
  });
  expect(response.status).toBe(400);
  expect(
    (await auth.authenticate(session.accessToken, deviceId)).user.role,
  ).toBe('buyer');
});
it('does not allow email-only login to bypass staff authentication', async () => {
  const session = await login();
  await auth.db.user.update({
    where: { id: session.user.id },
    data: { role: 'admin' },
  });
  await expect(
    auth.authenticate(session.accessToken, deviceId),
  ).rejects.toThrow();
  const request = await auth.requestCode(
    { email: session.user.email, ...device },
    randomUUID(),
  );
  await expect(
    auth.verifyCode(
      {
        ...device,
        challengeId: request.challengeId,
        code: code(session.user.email),
      },
      randomUUID(),
    ),
  ).rejects.toThrow();
});
it('documents every auth endpoint in OpenAPI', async () => {
  const doc = (await (await fetch(`${baseUrl}/docs-json`)).json()) as {
    paths: Record<string, unknown>;
  };
  for (const path of [
    'request-code',
    'verify-code',
    'refresh',
    'logout',
    'profile',
  ])
    expect(doc.paths).toHaveProperty(`/auth/${path}`);
});
it('serializes concurrent profile edits so audit before/after records form an exact chain', async () => {
  const session = await login();
  const identity = await auth.authenticate(session.accessToken, deviceId);
  await Promise.all(
    ['Amina', 'Tunde', 'Halima'].map((name) =>
      auth.updateProfile(identity, name),
    ),
  );
  const entries = await auth.db.auditLog.findMany({
    where: { actorId: session.user.id, action: 'profile.update' },
  });
  const transitions = new Map<string, string>();
  for (const entry of entries) {
    if (!entry.beforeCiphertext || !entry.afterCiphertext)
      throw new Error('Incomplete audit record.');
    const before = JSON.parse(
      decryptPii(Buffer.from(entry.beforeCiphertext), 'audit'),
    ) as { name: string };
    const after = JSON.parse(
      decryptPii(Buffer.from(entry.afterCiphertext), 'audit'),
    ) as { name: string };
    transitions.set(before.name, after.name);
  }
  expect(transitions.size).toBe(3);
  let name = session.user.name;
  for (let n = 0; n < 3; n++) {
    const next = transitions.get(name);
    if (!next) throw new Error('Audit history is not contiguous.');
    name = next;
  }
  expect(
    (await auth.authenticate(session.accessToken, deviceId)).user.name,
  ).toBe(name);
});
it('expires refresh credentials at the original absolute deadline', async () => {
  const session = await login();
  now += 30 * 24 * 60 * 60 * 1000;
  await expect(
    auth.refresh(
      { ...device, refreshToken: session.refreshToken },
      session.refreshToken,
      randomUUID(),
    ),
  ).rejects.toThrow();
});
it('serializes simultaneous refreshes and revokes the winner on replay', async () => {
  const session = await login();
  const outcomes = await Promise.allSettled([
    auth.refresh(
      { ...device, refreshToken: session.refreshToken },
      session.refreshToken,
      randomUUID(),
    ),
    auth.refresh(
      { ...device, refreshToken: session.refreshToken },
      session.refreshToken,
      randomUUID(),
    ),
  ]);
  expect(
    outcomes.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1);
  const winner = outcomes.find((result) => result.status === 'fulfilled');
  if (winner?.status !== 'fulfilled') throw new Error('Missing first refresh.');
  await expect(
    auth.authenticate(winner.value.accessToken, deviceId),
  ).rejects.toThrow();
});
it('returns HTTP 429 with retry guidance and does not trust forwarded IP headers', async () => {
  const address = email();
  for (let attempt = 0; attempt < 3; attempt++)
    expect(
      (
        await fetch(`${baseUrl}/auth/request-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...device, email: address }),
        })
      ).status,
    ).toBe(200);
  const limited = await fetch(`${baseUrl}/auth/request-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '203.0.113.4',
    },
    body: JSON.stringify({ ...device, email: address }),
  });
  expect(limited.status).toBe(429);
  expect(limited.headers.get('retry-after')).toBe('900');
  expect(await limited.text()).not.toContain(address);
});
it('never stores raw OTPs or bearer credentials', async () => {
  const session = await login();
  const stored = await auth.db.authSession.findFirstOrThrow({
    where: { userId: session.user.id },
  });
  expect(stored.accessHash).not.toBe(session.accessToken);
  expect(stored.refreshHash).not.toBe(session.refreshToken);
  expect(stored.accessHash).toMatch(/^[a-f0-9]{64}$/);
  const challenge = await auth.db.authChallenge.findFirstOrThrow({
    where: { emailHash: hashPii(session.user.email, 'email') },
  });
  expect(challenge.codeHash).toBe(
    hashPii(`${challenge.id}:${code(session.user.email)}`, 'auth-otp'),
  );
  expect(challenge.codeHash).toHaveLength(64);
});
it('invalidates a challenge after delivery failure without leaking provider errors', async () => {
  const address = email();
  const failing = new AuthService({
    databaseUrl: process.env.AUTH_TEST_DATABASE_URL,
    mode: 'local',
    now: () => now,
    emailProvider: {
      async sendCode() {
        throw new Error('Provider secret must not escape.');
      },
    },
  });
  try {
    await expect(
      failing.requestCode({ ...device, email: address }, randomUUID()),
    ).rejects.toThrow('Could not send the code.');
    const challenge = await failing.db.authChallenge.findFirstOrThrow({
      where: { emailHash: hashPii(address, 'email') },
    });
    expect(challenge.consumedAt).not.toBeNull();
  } finally {
    await failing.close();
  }
});
