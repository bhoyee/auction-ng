import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
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
const password = 'Synthetic fixture password 42';
const signup = { purpose: 'signup' as const, password, name: 'Auction buyer' };
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
    { email: address, ...device, ...signup },
    randomUUID(),
  );
  return auth.verifyCode(
    { ...device, challengeId: request.challengeId, code: code(address) },
    randomUUID(),
  );
}
// Keep independent scenarios in separate rate windows; each rate-limit test
// exercises all of its attempts within one unchanged server-time window.
beforeEach(() => {
  now += 900001;
});
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
it('permits verified buyer login in SMTP mode while retaining secure web cookies', async () => {
  const smtpApp = await createApi({
    databaseUrl: process.env.AUTH_TEST_DATABASE_URL,
    emailProvider: provider,
    mode: 'smtp',
    now: () => now,
  });
  try {
    await smtpApp.listen(0, '127.0.0.1');
    const base = await smtpApp.getUrl();
    const address = email();
    const headers = {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3300',
      'X-Auction-Client': 'web',
    };
    const request = await fetch(`${base}/auth/request-code`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email: address,
        deviceId,
        client: 'web',
        ...signup,
      }),
    });
    const challenge: unknown = await request.json();
    if (
      !challenge ||
      typeof challenge !== 'object' ||
      !('challengeId' in challenge)
    )
      throw new Error('Missing SMTP-mode challenge.');
    const response = await fetch(`${base}/auth/verify-code`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        challengeId: challenge.challengeId,
        code: code(address),
        deviceId,
        client: 'web',
      }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('; Secure');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  } finally {
    await smtpApp.close();
  }
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
  const challenge = await client.requestCode(address, password, 'signup');
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
  const again = await client.requestCode(address, password);
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
    body: JSON.stringify({ ...web, email: address, ...signup }),
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
    { email: address, ...device, ...signup },
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
    { email: other, ...device, ...signup },
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
    { email: address, ...device, ...signup },
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
  await auth.requestCode(
    { email: address, ...device, ...signup },
    randomUUID(),
  );
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
    { email: address, ...device, ...signup },
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
      auth.requestCode({ email: address, ...device, ...signup }, randomUUID()),
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
  await expect(
    auth.requestCode(
      { email: session.user.email, ...device, purpose: 'login', password },
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
    'reset-password',
    'change-password',
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
          body: JSON.stringify({ ...device, email: address, ...signup }),
        })
      ).status,
    ).toBe(200);
  const limited = await fetch(`${baseUrl}/auth/request-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '203.0.113.4',
    },
    body: JSON.stringify({ ...device, email: address, ...signup }),
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
      failing.requestCode(
        { ...device, email: address, ...signup },
        randomUUID(),
      ),
    ).rejects.toThrow('Could not send the code.');
    const challenge = await failing.db.authChallenge.findFirstOrThrow({
      where: { emailHash: hashPii(address, 'email') },
    });
    expect(challenge.consumedAt).not.toBeNull();
  } finally {
    await failing.close();
  }
});
it('requires the correct password before delivering a login code and rechecks account activity', async () => {
  const session = await login();
  const previous = code(session.user.email);
  await expect(
    auth.requestCode(
      {
        ...device,
        email: session.user.email,
        purpose: 'login',
        password: 'Incorrect password 42',
      },
      randomUUID(),
    ),
  ).rejects.toThrow();
  expect(code(session.user.email)).toBe(previous);
  const request = await auth.requestCode(
    { ...device, email: session.user.email, purpose: 'login', password },
    randomUUID(),
  );
  await auth.db.user.update({
    where: { id: session.user.id },
    data: { status: 'suspended' },
  });
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
  await expect(
    auth.authenticate(session.accessToken, deviceId),
  ).rejects.toThrow();
});
it('separates recovery from login and resets once while revoking all sessions and pending login challenges', async () => {
  const session = await login();
  const pending = await auth.requestCode(
    { ...device, email: session.user.email, purpose: 'login', password },
    randomUUID(),
  );
  const pendingCode = code(session.user.email);
  const request = await auth.requestCode(
    { ...device, email: session.user.email, purpose: 'reset' },
    randomUUID(),
  );
  const recovery = {
    ...device,
    challengeId: request.challengeId,
    code: code(session.user.email),
    newPassword: 'New unique password 2026',
  };
  await expect(
    auth.verifyCode(
      { ...device, challengeId: request.challengeId, code: recovery.code },
      randomUUID(),
    ),
  ).rejects.toThrow();
  const outcomes = await Promise.allSettled([
    auth.resetPassword(recovery, randomUUID()),
    auth.resetPassword(recovery, randomUUID()),
  ]);
  expect(outcomes.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
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
    auth.verifyCode(
      { ...device, challengeId: pending.challengeId, code: pendingCode },
      randomUUID(),
    ),
  ).rejects.toThrow();
  now += 900000;
  await expect(
    auth.requestCode(
      { ...device, email: session.user.email, purpose: 'login', password },
      randomUUID(),
    ),
  ).rejects.toThrow();
  const fresh = await auth.requestCode(
    {
      ...device,
      email: session.user.email,
      purpose: 'login',
      password: recovery.newPassword,
    },
    randomUUID(),
  );
  expect(
    (
      await auth.verifyCode(
        {
          ...device,
          challengeId: fresh.challengeId,
          code: code(session.user.email),
        },
        randomUUID(),
      )
    ).user.id,
  ).toBe(session.user.id);
  const saved = await auth.db.user.findUniqueOrThrow({
    where: { id: session.user.id },
  });
  expect(saved.buyerPasswordHash).not.toContain(recovery.newPassword);
});
it('allows legacy buyers to set their first password only with recovery proof and rejects legacy OTP challenges', async () => {
  const address = email();
  const { encryptPii } = await import('../apps/api/src/security/pii');
  const user = await auth.db.user.create({
    data: {
      name: 'Existing buyer',
      emailHash: hashPii(address, 'email'),
      emailCiphertext: encryptPii(address, 'email'),
    },
  });
  const challengeId = randomUUID();
  await auth.db.authChallenge.create({
    data: {
      id: challengeId,
      emailHash: hashPii(address, 'email'),
      emailCiphertext: encryptPii(address, 'email'),
      codeHash: hashPii(challengeId + ':123456', 'auth-otp'),
      deviceHash: hashPii('mobile:' + deviceId, 'auth-device'),
      client: 'mobile',
      expiresAt: new Date(now + 300000),
    },
  });
  await expect(
    auth.verifyCode({ ...device, challengeId, code: '123456' }, randomUUID()),
  ).rejects.toThrow();
  await expect(
    auth.requestCode(
      { ...device, email: address, purpose: 'login', password },
      randomUUID(),
    ),
  ).rejects.toThrow();
  const request = await auth.requestCode(
    { ...device, email: address, purpose: 'reset' },
    randomUUID(),
  );
  await expect(
    auth.resetPassword(
      {
        ...device,
        deviceId: randomUUID(),
        challengeId: request.challengeId,
        code: code(address),
        newPassword: password,
      },
      randomUUID(),
    ),
  ).rejects.toThrow();
  await auth.resetPassword(
    {
      ...device,
      challengeId: request.challengeId,
      code: code(address),
      newPassword: password,
    },
    randomUUID(),
  );
  expect(
    (await auth.db.user.findUniqueOrThrow({ where: { id: user.id } }))
      .buyerPasswordHash,
  ).toBeTruthy();
});
it('changes password only with current credentials and fences all old sessions', async () => {
  const session = await login();
  const identity = await auth.authenticate(session.accessToken, deviceId);
  await expect(
    auth.changePassword(
      identity,
      {
        currentPassword: 'Incorrect password 42',
        newPassword: 'Updated unique password 42',
      },
      randomUUID(),
    ),
  ).rejects.toThrow();
  const fenced: string[][] = [];
  const previous = auth.beforeSessionRevocation;
  auth.beforeSessionRevocation = async (ids) => {
    fenced.push(ids);
    if (previous) await previous(ids);
  };
  try {
    await auth.changePassword(
      identity,
      { currentPassword: password, newPassword: 'Updated unique password 42' },
      randomUUID(),
    );
  } finally {
    auth.beforeSessionRevocation = previous;
  }
  expect(fenced.flat()).toContain(identity.sessionId);
  await expect(
    auth.authenticate(session.accessToken, deviceId),
  ).rejects.toThrow();
  await expect(
    auth.changePassword(
      identity,
      { currentPassword: 'Updated unique password 42', newPassword: password },
      randomUUID(),
    ),
  ).rejects.toThrow();
});
it('keeps unknown and staff recovery requests generic without sending mail or creating users', async () => {
  const unknown = email();
  const before = await auth.db.user.count();
  const request = await auth.requestCode(
    { ...device, email: unknown, purpose: 'reset' },
    randomUUID(),
  );
  expect(request.challengeId).toBeTruthy();
  expect(inbox.has(unknown)).toBe(false);
  expect(await auth.db.user.count()).toBe(before);
  const session = await login();
  await auth.db.user.update({
    where: { id: session.user.id },
    data: { role: 'admin' },
  });
  const previous = code(session.user.email);
  await auth.requestCode(
    { ...device, email: session.user.email, purpose: 'reset' },
    randomUUID(),
  );
  expect(code(session.user.email)).toBe(previous);
});
it('stores profile phone and full address encrypted while keeping email and verification protected', async () => {
  const session = await login();
  const identity = await auth.authenticate(session.accessToken, deviceId);
  const profile = await auth.updateProfile(identity, {
    name: 'Amina Yusuf',
    phone: '+2348031234567',
    address: '12 Example Road, Ikeja, Lagos',
  });
  expect(profile).toMatchObject({
    name: 'Amina Yusuf',
    email: session.user.email,
    emailVerified: true,
    phone: '+2348031234567',
    phoneVerified: false,
    address: '12 Example Road, Ikeja, Lagos',
  });
  const saved = await auth.db.user.findUniqueOrThrow({
    where: { id: session.user.id },
  });
  expect(Buffer.from(saved.addressCiphertext ?? []).toString()).not.toContain(
    'Example Road',
  );
  expect(Buffer.from(saved.phoneCiphertext ?? []).toString()).not.toContain(
    '+234',
  );
  const client = createAuthClient(baseUrl, device);
  await expect(
    client.updateProfile(session.accessToken, {
      name: 'Amina',
      phone: 'invalid',
    }),
  ).rejects.toThrow();
  const response = await fetch(`${baseUrl}/auth/profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
      'X-Device-Id': deviceId,
    },
    body: JSON.stringify({ name: 'Amina', email: 'changed@example.test' }),
  });
  expect(response.status).toBe(400);
});
it('rejects weak passwords and missing password proofs at the public boundary', async () => {
  const client = createAuthClient(baseUrl, device);
  await expect(
    client.requestCode(email(), 'short', 'signup'),
  ).rejects.toThrow();
  const response = await fetch(`${baseUrl}/auth/request-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...device, email: email() }),
  });
  expect(response.status).toBe(400);
});
it('fences legacy email-only sessions during the password-auth rollout', async () => {
  const session = await login();
  const stored = await auth.db.authSession.findUniqueOrThrow({
    where: { accessHash: hashPii(session.accessToken, 'auth-token') },
  });
  await auth.db.authSession.update({
    where: { id: stored.id },
    data: { buyerMfa: false },
  });
  await expect(
    auth.authenticate(session.accessToken, deviceId),
  ).rejects.toThrow();
  await auth.revokeLegacyBuyerSessions();
  expect(
    (await auth.db.authSession.findUniqueOrThrow({ where: { id: stored.id } }))
      .revokedAt,
  ).not.toBeNull();
  await expect(
    auth.refresh(
      { ...device, refreshToken: session.refreshToken },
      session.refreshToken,
      randomUUID(),
    ),
  ).rejects.toThrow();
});
it('rejects unknown sign-in emails with the same credential error and sends no code', async () => {
  const address = email();
  await expect(
    auth.requestCode(
      { ...device, email: address, purpose: 'login', password },
      randomUUID(),
    ),
  ).rejects.toThrow('Invalid email or password.');
  expect(inbox.has(address)).toBe(false);
  expect(
    await auth.db.authChallenge.count({
      where: { emailHash: hashPii(address, 'email') },
    }),
  ).toBe(0);
});
it('limits invalid login attempts by IP even when emails and installations change', async () => {
  const ip = randomUUID();
  for (let index = 0; index < 10; index++)
    await expect(
      auth.requestCode(
        {
          ...device,
          deviceId: randomUUID(),
          email: email(),
          purpose: 'login',
          password,
        },
        ip,
      ),
    ).rejects.toMatchObject({ status: 401 });
  await expect(
    auth.requestCode(
      {
        ...device,
        deviceId: randomUUID(),
        email: email(),
        purpose: 'login',
        password,
      },
      ip,
    ),
  ).rejects.toMatchObject({ status: 429 });
});
it('limits invalid login attempts by installation across different IP addresses', async () => {
  const deviceId = randomUUID();
  for (let index = 0; index < 8; index++)
    await expect(
      auth.requestCode(
        { ...device, deviceId, email: email(), purpose: 'login', password },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 401 });
  await expect(
    auth.requestCode(
      { ...device, deviceId, email: email(), purpose: 'login', password },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 429 });
});
it('limits concurrent recovery requests across addresses without revealing or emailing unknown accounts', async () => {
  const ip = randomUUID();
  const addresses = Array.from({ length: 10 }, email);
  const results = await Promise.allSettled(
    addresses.map((address) =>
      auth.requestCode(
        { ...device, deviceId: randomUUID(), email: address, purpose: 'reset' },
        ip,
      ),
    ),
  );
  expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(5);
  for (const row of results)
    if (row.status === 'rejected') expect(row.reason.getStatus()).toBe(429);
  expect(addresses.some((address) => inbox.has(address))).toBe(false);
  const deviceId = randomUUID();
  for (let index = 0; index < 3; index++)
    await auth.requestCode(
      { ...device, deviceId, email: email(), purpose: 'reset' },
      randomUUID(),
    );
  await expect(
    auth.requestCode(
      { ...device, deviceId, email: email(), purpose: 'reset' },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 429 });
});
it('rejects signup honeypot submissions without creating accounts, challenges or mail', async () => {
  const address = email();
  const client = createAuthClient(baseUrl, {
    ...device,
    deviceId: randomUUID(),
  });
  await expect(
    client.requestCode(
      address,
      password,
      'signup',
      'Synthetic buyer',
      'https://spam.example',
    ),
  ).rejects.toMatchObject({ status: 400 });
  expect(inbox.has(address)).toBe(false);
  expect(
    await auth.db.user.count({
      where: { emailHash: hashPii(address, 'email') },
    }),
  ).toBe(0);
  expect(
    await auth.db.authChallenge.count({
      where: { emailHash: hashPii(address, 'email') },
    }),
  ).toBe(0);
});
it('limits signup bot attempts by installation and IP across changing addresses', async () => {
  const deviceId = randomUUID();
  for (let index = 0; index < 5; index++)
    await expect(
      auth.requestCode(
        { ...device, deviceId, email: email(), ...signup, website: 'bot' },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 400 });
  await expect(
    auth.requestCode(
      { ...device, deviceId, email: email(), ...signup, website: 'bot' },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 429 });
  const ip = randomUUID();
  for (let index = 0; index < 10; index++)
    await expect(
      auth.requestCode(
        {
          ...device,
          deviceId: randomUUID(),
          email: email(),
          ...signup,
          website: 'bot',
        },
        ip,
      ),
    ).rejects.toMatchObject({ status: 400 });
  await expect(
    auth.requestCode(
      {
        ...device,
        deviceId: randomUUID(),
        email: email(),
        ...signup,
        website: 'bot',
      },
      ip,
    ),
  ).rejects.toMatchObject({ status: 429 });
});
