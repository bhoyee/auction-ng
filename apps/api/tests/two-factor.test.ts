import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { AuthService } from '../src/auth/auth-service';
import { TwoFactorService } from '../src/auth/two-factor-service';
import {
  totpCode,
  hashStaffPassword,
  newTotpSecret,
} from '../src/auth/staff-crypto';
import { encryptPii, hashPii } from '../src/security/pii';
import { consumeTwoFactor } from '../src/auth/two-factor-proof';
import { createApi } from '../src/app';
import { createStaffSignIn } from './staff-sign-in-helper';
const staffSignIn = createStaffSignIn(
  () => auth,
  () => codes,
);
let auth: AuthService, security: TwoFactorService;
let app: Awaited<ReturnType<typeof createApi>>, baseUrl: string;
let clock = Date.now();
const codes = new Map<string, string>();
beforeAll(async () => {
  const databaseUrl =
    process.env.MFA_TEST_DATABASE_URL ?? process.env.AUTH_TEST_DATABASE_URL;
  if (
    !databaseUrl ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(databaseUrl).pathname)
  )
    throw Error('Isolated MFA database required');
  auth = new AuthService({
    databaseUrl,
    mode: 'local',
    now: () => clock,
    emailProvider: {
      async sendCode(email, code) {
        codes.set(email, code);
      },
    },
  });
  security = new TwoFactorService(auth);
  app = await createApi({
    databaseUrl,
    mode: 'local',
    now: () => clock,
    emailProvider: {
      async sendCode(email, code) {
        codes.set(email, code);
      },
    },
  });
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});
afterAll(async () => {
  await app?.close();
  await auth?.close();
});
async function buyer() {
  const email = `${randomUUID()}@example.test`,
    deviceId = randomUUID(),
    password = 'Synthetic buyer password 42';
  const challenge = await auth.requestCode(
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
  const code = codes.get(email);
  if (!code) throw Error('Missing test code');
  const tokens = await auth.verifyCode(
    { challengeId: challenge.challengeId, code, deviceId, client: 'web' },
    randomUUID(),
  );
  const identity = await auth.authenticate(tokens.accessToken, deviceId);
  return { email, deviceId, password, tokens, identity };
}
async function enable(f: Awaited<ReturnType<typeof buyer>>) {
  const request = await security.start(
    f.identity,
    { purpose: 'enable', password: f.password },
    randomUUID(),
  );
  const code = codes.get(f.email);
  if (!code) throw Error('Missing email');
  const setup = await security.verifyEmail(
    f.identity,
    { id: request.id, code },
    randomUUID(),
  );
  if (!setup.secret) throw Error('Missing setup');
  const result = await security.finish(
    f.identity,
    {
      id: request.id,
      newCode: totpCode(setup.secret, Math.floor(clock / 30000)),
    },
    randomUUID(),
  );
  return { secret: setup.secret, result };
}
it('enables only after password, bound email and proof of the new authenticator, with encrypted secrets and hashed recovery codes', async () => {
  const f = await buyer();
  await expect(
    security.start(
      f.identity,
      { purpose: 'enable', password: 'incorrect' },
      randomUUID(),
    ),
  ).rejects.toThrow();
  const { secret, result } = await enable(f);
  expect(result.enabled).toBe(true);
  expect(result.recoveryCodes).toHaveLength(10);
  const stored = await auth.db.buyerAuthenticator.findUniqueOrThrow({
    where: { userId: f.identity.user.id },
  });
  expect(Buffer.from(stored.secretCiphertext).toString()).not.toContain(secret);
  const rows = await auth.db.authRecoveryCode.findMany({
    where: { userId: f.identity.user.id },
  });
  expect(rows).toHaveLength(10);
  expect(JSON.stringify(rows)).not.toContain(result.recoveryCodes?.[0]);
  expect((await security.status(f.identity)).recoveryCodesRemaining).toBe(10);
});
it('does not issue login sessions or reset passwords until the emailed proof and enrolled factor both pass', async () => {
  const f = await buyer(),
    { secret } = await enable(f);
  const challenge = await auth.requestCode(
    {
      purpose: 'login',
      email: f.email,
      password: f.password,
      deviceId: f.deviceId,
      client: 'web',
    },
    randomUUID(),
  );
  const code = codes.get(f.email);
  if (!code) throw Error('Missing code');
  const input = {
    challengeId: challenge.challengeId,
    code,
    deviceId: f.deviceId,
    client: 'web' as const,
  };
  await expect(auth.verifyCode(input, randomUUID())).rejects.toMatchObject({
    status: 422,
  });
  clock += 30000;
  const login = await auth.verifyCode(
    {
      ...input,
      factor: {
        method: 'authenticator',
        code: totpCode(secret, Math.floor(clock / 30000)),
      },
    },
    randomUUID(),
  );
  expect(login.user.id).toBe(f.identity.user.id);
  await expect(auth.verifyCode(input, randomUUID())).rejects.toThrow();
  const reset = await auth.requestCode(
    { purpose: 'reset', email: f.email, deviceId: f.deviceId, client: 'web' },
    randomUUID(),
  );
  const resetCode = codes.get(f.email);
  if (!resetCode) throw Error('Missing reset code');
  await expect(
    auth.resetPassword(
      {
        challengeId: reset.challengeId,
        code: resetCode,
        deviceId: f.deviceId,
        client: 'web',
        newPassword: 'Synthetic replacement password 43',
      },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 422 });
});
it('consumes a recovery code once under concurrent requests and refuses other owners', async () => {
  const f = await buyer(),
    { result } = await enable(f),
    code = result.recoveryCodes?.[0];
  if (!code) throw Error('Missing recovery code');
  const proof = { method: 'recovery' as const, code };
  const other = await buyer();
  await enable(other);
  expect(
    await auth.db.$transaction((tx) =>
      consumeTwoFactor(tx, other.identity.user.id, proof, clock),
    ),
  ).toBe('invalid');
  const outcomes = await Promise.all(
    Array.from({ length: 10 }, () =>
      auth.db.$transaction((tx) =>
        consumeTwoFactor(tx, f.identity.user.id, proof, clock),
      ),
    ),
  );
  expect(outcomes.filter((value) => value === 'valid')).toHaveLength(1);
});
it('requires the current factor to disable and rejects stale/replayed setup or another session', async () => {
  const f = await buyer(),
    { result } = await enable(f),
    factor = {
      method: 'recovery' as const,
      code: result.recoveryCodes?.[0] ?? '',
    };
  const challenge = await security.start(
    f.identity,
    { purpose: 'disable', password: f.password },
    randomUUID(),
  );
  const code = codes.get(f.email);
  if (!code) throw Error('Missing code');
  await security.verifyEmail(
    f.identity,
    { id: challenge.id, code },
    randomUUID(),
  );
  await expect(
    security.finish(f.identity, { id: challenge.id }, randomUUID()),
  ).rejects.toMatchObject({ status: 422 });
  expect(
    (
      await security.finish(
        f.identity,
        { id: challenge.id, factor },
        randomUUID(),
      )
    ).enabled,
  ).toBe(false);
  await expect(
    security.finish(f.identity, { id: challenge.id, factor }, randomUUID()),
  ).rejects.toThrow();
});

async function confirmed(
  f: Awaited<ReturnType<typeof buyer>>,
  purpose: 'disable' | 'rotate' | 'recovery' | 'change-password',
  newPassword?: string,
) {
  const request = await security.start(
    f.identity,
    { purpose, password: f.password, ...(newPassword ? { newPassword } : {}) },
    randomUUID(),
  );
  const code = codes.get(f.email);
  if (!code) throw Error('Missing email');
  const setup = await security.verifyEmail(
    f.identity,
    { id: request.id, code },
    randomUUID(),
  );
  return { request, setup };
}
it('rejects cross-owner, cross-session, unverified and expired settings challenges', async () => {
  const f = await buyer(),
    other = await buyer();
  const request = await security.start(
    f.identity,
    { purpose: 'enable', password: f.password },
    randomUUID(),
  );
  const code = codes.get(f.email);
  if (!code) throw Error('Missing code');
  await expect(
    security.verifyEmail(
      other.identity,
      { id: request.id, code },
      randomUUID(),
    ),
  ).rejects.toThrow();
  await expect(
    security.finish(
      f.identity,
      { id: request.id, newCode: '000000' },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 403 });
  const login = await auth.requestCode(
    {
      purpose: 'login',
      email: f.email,
      password: f.password,
      deviceId: f.deviceId,
      client: 'web',
    },
    randomUUID(),
  );
  const mail = codes.get(f.email);
  if (!mail) throw Error('Missing login code');
  const tokens = await auth.verifyCode(
    {
      challengeId: login.challengeId,
      code: mail,
      deviceId: f.deviceId,
      client: 'web',
    },
    randomUUID(),
  );
  const second = await auth.authenticate(tokens.accessToken, f.deviceId);
  await expect(
    security.verifyEmail(second, { id: request.id, code }, randomUUID()),
  ).rejects.toThrow();
  await auth.db.accountSecurityChallenge.update({
    where: { id: request.id },
    data: { expiresAt: new Date(clock - 1) },
  });
  await expect(
    security.verifyEmail(f.identity, { id: request.id, code }, randomUUID()),
  ).rejects.toThrow();
});
it('limits invalid emailed codes and never discloses setup secrets without verifying email', async () => {
  const f = await buyer();
  const request = await security.start(
    f.identity,
    { purpose: 'enable', password: f.password },
    randomUUID(),
  );
  const code = codes.get(f.email);
  if (!code) throw Error('Missing code');
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++)
    await expect(
      security.verifyEmail(
        f.identity,
        { id: request.id, code: wrong },
        randomUUID(),
      ),
    ).rejects.toThrow();
  await expect(
    security.verifyEmail(f.identity, { id: request.id, code }, randomUUID()),
  ).rejects.toThrow();
  expect((await security.status(f.identity)).enabled).toBe(false);
  expect(Object.keys(await security.status(f.identity)).sort()).toEqual([
    'enabled',
    'mandatory',
    'recoveryCodesRemaining',
  ]);
});
it('consumes an authenticator counter once across concurrent protected actions', async () => {
  const f = await buyer(),
    { secret } = await enable(f);
  clock += 30000;
  const factor = {
    method: 'authenticator' as const,
    code: totpCode(secret, Math.floor(clock / 30000)),
  };
  const result = await Promise.all(
    Array.from({ length: 8 }, () =>
      auth.db.$transaction((tx) =>
        consumeTwoFactor(tx, f.identity.user.id, factor, clock),
      ),
    ),
  );
  expect(result.filter((value) => value === 'valid')).toHaveLength(1);
});
it('replaces recovery codes atomically, invalidates the old set and fences other devices', async () => {
  const f = await buyer();
  const login = await auth.requestCode(
    {
      purpose: 'login',
      email: f.email,
      password: f.password,
      deviceId: f.deviceId,
      client: 'web',
    },
    randomUUID(),
  );
  const email = codes.get(f.email);
  if (!email) throw Error('Missing code');
  const other = await auth.verifyCode(
    {
      challengeId: login.challengeId,
      code: email,
      deviceId: f.deviceId,
      client: 'web',
    },
    randomUUID(),
  );
  const { result } = await enable(f);
  await expect(
    auth.authenticate(other.accessToken, f.deviceId),
  ).rejects.toThrow();
  await expect(
    auth.refresh(
      { client: 'web', deviceId: f.deviceId },
      other.refreshToken,
      randomUUID(),
    ),
  ).rejects.toThrow();
  expect(
    (await auth.authenticate(f.tokens.accessToken, f.deviceId)).user
      .twoFactorEnabled,
  ).toBe(true);
  const { request } = await confirmed(f, 'recovery');
  const first = result.recoveryCodes?.[0],
    second = result.recoveryCodes?.[1];
  if (!first || !second) throw Error('Missing codes');
  const next = await security.finish(
    f.identity,
    { id: request.id, factor: { method: 'recovery', code: first } },
    randomUUID(),
  );
  expect(next.recoveryCodes).toHaveLength(10);
  expect(
    await auth.db.$transaction((tx) =>
      consumeTwoFactor(
        tx,
        f.identity.user.id,
        { method: 'recovery', code: second },
        clock,
      ),
    ),
  ).toBe('invalid');
});
it('binds password confirmation to the new password and rejects another security purpose', async () => {
  const f = await buyer(),
    { result } = await enable(f);
  const recovery = result.recoveryCodes?.[0];
  if (!recovery) throw Error('Missing code');
  const factor = { method: 'recovery' as const, code: recovery };
  const replacement = 'Synthetic new account password 44';
  await expect(
    auth.changePassword(
      f.identity,
      { currentPassword: f.password, newPassword: replacement },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 422 });
  const wrongPurpose = await confirmed(f, 'recovery');
  await expect(
    auth.changePassword(
      f.identity,
      {
        currentPassword: f.password,
        newPassword: replacement,
        securityChallengeId: wrongPurpose.request.id,
        factor,
      },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 403 });
  const { request } = await confirmed(f, 'change-password', replacement);
  await expect(
    auth.changePassword(
      f.identity,
      {
        currentPassword: f.password,
        newPassword: replacement + 'different',
        securityChallengeId: request.id,
        factor,
      },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 403 });
  await auth.changePassword(
    f.identity,
    {
      currentPassword: f.password,
      newPassword: replacement,
      securityChallengeId: request.id,
      factor,
    },
    randomUUID(),
  );
  await expect(
    auth.authenticate(f.tokens.accessToken, f.deviceId),
  ).rejects.toThrow();
});
it('requires recovery proof for password reset and never signs in from password recovery', async () => {
  const f = await buyer(),
    { result } = await enable(f);
  const request = await auth.requestCode(
    { purpose: 'reset', email: f.email, deviceId: f.deviceId, client: 'web' },
    randomUUID(),
  );
  const code = codes.get(f.email),
    recovery = result.recoveryCodes?.[0];
  if (!code || !recovery) throw Error('Missing codes');
  const input = {
    challengeId: request.challengeId,
    code,
    deviceId: f.deviceId,
    client: 'web' as const,
    newPassword: 'Synthetic replacement password 45',
  };
  await expect(auth.resetPassword(input, randomUUID())).rejects.toMatchObject({
    status: 422,
  });
  expect(
    await auth.resetPassword(
      { ...input, factor: { method: 'recovery', code: recovery } },
      randomUUID(),
    ),
  ).toBeUndefined();
  await expect(
    auth.authenticate(f.tokens.accessToken, f.deviceId),
  ).rejects.toThrow();
  expect((await security.status(f.identity)).enabled).toBe(true);
});
it('keeps enrolled staff protected and recovers only with password, email and an unused recovery code', async () => {
  const email = `${randomUUID()}@example.test`,
    password = 'Synthetic staff password 42',
    deviceId = randomUUID(),
    secret = newTotpSecret();
  const user = await auth.db.user.create({
    data: {
      name: 'Synthetic administrator',
      authenticatorEnabled: true,
      role: 'admin',
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
      emailVerifiedAt: new Date(clock),
      staffCredential: {
        create: {
          passwordHash: await hashStaffPassword(password),
          totpSecretCiphertext: encryptPii(secret, 'staff-totp'),
        },
      },
    },
  });
  const tokens = await staffSignIn(
    {
      email,
      password,
      deviceId,
      client: 'web',
      code: totpCode(secret, Math.floor(clock / 30000)),
    },
    randomUUID(),
  );
  const identity = await auth.authenticate(tokens.accessToken, deviceId);
  expect((await security.status(identity)).mandatory).toBe(false);
  const request = await security.start(
    identity,
    { purpose: 'recovery', password },
    randomUUID(),
  );
  const code = codes.get(email);
  if (!code) throw Error('Missing code');
  await security.verifyEmail(identity, { id: request.id, code }, randomUUID());
  clock += 30000;
  const result = await security.finish(
    identity,
    {
      id: request.id,
      factor: {
        method: 'authenticator',
        code: totpCode(secret, Math.floor(clock / 30000)),
      },
    },
    randomUUID(),
  );
  const recoveryCode = result.recoveryCodes?.[0];
  if (!recoveryCode) throw Error('Missing recovery');
  const recovery = await auth.staffRecoveryStart(
    { email, password, deviceId, client: 'web' },
    randomUUID(),
  );
  const emailCode = codes.get(email);
  if (!emailCode) throw Error('Missing recovery email');
  const input = {
    challengeId: recovery.challengeId,
    code: emailCode,
    recoveryCode,
    deviceId,
    client: 'web' as const,
  };
  await expect(
    auth.staffRecoveryVerify(
      { ...input, code: emailCode === '000000' ? '111111' : '000000' },
      randomUUID(),
    ),
  ).rejects.toThrow();
  expect((await auth.staffRecoveryVerify(input, randomUUID())).user.id).toBe(
    user.id,
  );
  await expect(auth.staffRecoveryVerify(input, randomUUID())).rejects.toThrow();
  await expect(
    auth.verifyCode(
      {
        challengeId: recovery.challengeId,
        code: emailCode,
        deviceId,
        client: 'web',
      },
      randomUUID(),
    ),
  ).rejects.toThrow();
});
it('guards the HTTP security endpoints, validates strict fields and returns uncached typed policy', async () => {
  const f = await buyer();
  const headers = {
    Authorization: `Bearer ${f.tokens.accessToken}`,
    'X-Device-Id': f.deviceId,
    'Content-Type': 'application/json',
  };
  expect((await fetch(baseUrl + '/auth/security')).status).toBe(401);
  const status = await fetch(baseUrl + '/auth/security', { headers });
  expect(status.status).toBe(200);
  expect(status.headers.get('cache-control')).toBe('no-store');
  expect(await status.json()).toEqual({
    enabled: false,
    mandatory: false,
    recoveryCodesRemaining: 0,
  });
  expect(
    (
      await fetch(baseUrl + '/auth/security?userId=' + randomUUID(), {
        headers,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await fetch(baseUrl + '/auth/security/start', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          purpose: 'enable',
          password: f.password,
          userId: f.identity.user.id,
        }),
      })
    ).status,
  ).toBe(400);
  await enable(f);
  const request = await auth.requestCode(
    {
      purpose: 'login',
      email: f.email,
      password: f.password,
      deviceId: f.deviceId,
      client: 'mobile',
    },
    randomUUID(),
  );
  const code = codes.get(f.email);
  if (!code) throw Error('Missing code');
  const verify = await fetch(baseUrl + '/auth/verify-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challengeId: request.challengeId,
      code,
      deviceId: f.deviceId,
      client: 'mobile',
    }),
  });
  expect(verify.status).toBe(422);
  expect(await verify.json()).toMatchObject({ code: 'TWO_FACTOR_REQUIRED' });
  expect(verify.headers.get('set-cookie')).toBeNull();
});
it('requires the extra factor for mobile logins as well as browser logins', async () => {
  const f = await buyer(),
    { result } = await enable(f);
  const request = await auth.requestCode(
    {
      purpose: 'login',
      email: f.email,
      password: f.password,
      deviceId: f.deviceId,
      client: 'mobile',
    },
    randomUUID(),
  );
  const code = codes.get(f.email),
    recovery = result.recoveryCodes?.[0];
  if (!code || !recovery) throw Error('Missing codes');
  const input = {
    challengeId: request.challengeId,
    code,
    deviceId: f.deviceId,
    client: 'mobile' as const,
  };
  await expect(auth.verifyCode(input, randomUUID())).rejects.toMatchObject({
    status: 422,
  });
  expect(
    (
      await auth.verifyCode(
        { ...input, factor: { method: 'recovery', code: recovery } },
        randomUUID(),
      )
    ).user.id,
  ).toBe(f.identity.user.id);
});
it('rotates the authenticator only with both current protection and proof of the new app', async () => {
  const f = await buyer(),
    { secret, result } = await enable(f);
  const { request, setup } = await confirmed(f, 'rotate');
  if (!setup.secret) throw Error('Missing setup');
  const recovery = result.recoveryCodes?.[0];
  if (!recovery) throw Error('Missing recovery');
  const factor = { method: 'recovery' as const, code: recovery };
  await expect(
    security.finish(f.identity, { id: request.id, factor }, randomUUID()),
  ).rejects.toMatchObject({ status: 422 });
  await security.finish(
    f.identity,
    {
      id: request.id,
      factor,
      newCode: totpCode(setup.secret, Math.floor(clock / 30000)),
    },
    randomUUID(),
  );
  clock += 30000;
  expect(
    await auth.db.$transaction((tx) =>
      consumeTwoFactor(
        tx,
        f.identity.user.id,
        {
          method: 'authenticator',
          code: totpCode(secret, Math.floor(clock / 30000)),
        },
        clock,
      ),
    ),
  ).toBe('invalid');
  expect(
    await auth.db.$transaction((tx) =>
      consumeTwoFactor(
        tx,
        f.identity.user.id,
        {
          method: 'authenticator',
          code: totpCode(setup.secret ?? '', Math.floor(clock / 30000)),
        },
        clock,
      ),
    ),
  ).toBe('valid');
});
it('rate-limits security challenges before credential validation', async () => {
  const f = await buyer();
  for (let i = 0; i < 20; i++)
    await auth.securityRate(f.identity.user.id, randomUUID());
  await expect(
    security.start(
      f.identity,
      { purpose: 'enable', password: f.password },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 429 });
});
