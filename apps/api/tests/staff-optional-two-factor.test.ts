import { beforeAll, afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { AuthService } from '../src/auth/auth-service';
import { TwoFactorService } from '../src/auth/two-factor-service';
import {
  hashStaffPassword,
  newTotpSecret,
  totpCode,
} from '../src/auth/staff-crypto';
import { encryptPii, hashPii } from '../src/security/pii';
import { LedgerService } from '../src/ledger/ledger-service';
import { StaffAdminService } from '../src/staff-admin/staff-admin-service';
import { BidService } from '../src/bids/bid-service';
let auth: AuthService, security: TwoFactorService;
let unaffectedStaff: Awaited<ReturnType<typeof account>>;
let clock = Date.now();
const inbox = new Map<string, string>();

async function passwordChallenge(
  f: Awaited<ReturnType<typeof account>>,
  newPassword: string,
) {
  const challenge = await security.start(
    f.identity,
    { purpose: 'change-password', password: f.password, newPassword },
    randomUUID(),
  );
  await security.verifyEmail(
    f.identity,
    { id: challenge.id, code: inbox.get(f.email) ?? '' },
    randomUUID(),
  );
  return challenge.id;
}

it('staff password changes reject missing, expired and foreign-session email proof', async () => {
  const f = await account();
  const newPassword = 'Synthetic email-bound replacement password';
  await expect(
    auth.changeStaffPassword(
      f.identity,
      {
        currentPassword: f.password,
        newPassword,
        securityChallengeId: randomUUID(),
      },
      randomUUID(),
    ),
  ).rejects.toThrow();
  const id = await passwordChallenge(f, newPassword);
  const device = randomUUID();
  const tokens = await auth.staffSignIn(
    { email: f.email, password: f.password, deviceId: device, client: 'web' },
    randomUUID(),
  );
  const other = await auth.authenticate(tokens.accessToken, device);
  await expect(
    auth.changeStaffPassword(
      other,
      { currentPassword: f.password, newPassword, securityChallengeId: id },
      randomUUID(),
    ),
  ).rejects.toThrow();
  await auth.db.accountSecurityChallenge.update({
    where: { id },
    data: { expiresAt: new Date(clock - 1) },
  });
  await expect(
    auth.changeStaffPassword(
      f.identity,
      { currentPassword: f.password, newPassword, securityChallengeId: id },
      randomUUID(),
    ),
  ).rejects.toThrow();
  expect(
    (
      await auth.db.staffCredential.findUniqueOrThrow({
        where: { userId: f.user.id },
      })
    ).passwordHash,
  ).toBeTruthy();
  expect(await f.signIn()).toBeTruthy();
});

it('staff password changes rate-limit repeated invalid current passwords', async () => {
  const f = await account();
  const input = {
    currentPassword: 'wrong',
    newPassword: 'Synthetic rate-limit replacement password',
    securityChallengeId: randomUUID(),
  };
  for (let attempt = 0; attempt < 5; attempt++)
    await expect(
      auth.changeStaffPassword(f.identity, input, randomUUID()),
    ).rejects.toMatchObject({ status: 401 });
  await expect(
    auth.changeStaffPassword(f.identity, input, randomUUID()),
  ).rejects.toMatchObject({ status: 429 });
});

it('staff password changes require verified email and revoke every own session while retaining other staff access', async () => {
  const f = await account(),
    other = unaffectedStaff;
  const extraDevice = randomUUID();
  const extra = await auth.staffSignIn(
    {
      email: f.email,
      password: f.password,
      deviceId: extraDevice,
      client: 'web',
    },
    randomUUID(),
  );
  const newPassword = 'Synthetic replacement staff passphrase';
  const id = await passwordChallenge(f, newPassword);
  const fenced: string[] = [];
  auth.beforeSessionRevocation = async (ids) => {
    fenced.push(...ids);
  };
  try {
    await auth.changeStaffPassword(
      f.identity,
      { currentPassword: f.password, newPassword, securityChallengeId: id },
      randomUUID(),
    );
  } finally {
    auth.beforeSessionRevocation = undefined;
  }
  expect(fenced).toContain(f.identity.sessionId);
  expect(
    await auth.db.authSession.count({
      where: { userId: f.user.id, revokedAt: null },
    }),
  ).toBe(0);
  expect(
    await auth.db.authSession.count({
      where: { userId: other.user.id, revokedAt: null },
    }),
  ).toBeGreaterThan(0);
  await expect(
    auth.authenticate(extra.accessToken, extraDevice),
  ).rejects.toThrow();
  await expect(f.signIn()).rejects.toThrow();
  const next = await auth.staffSignIn(
    {
      email: f.email,
      password: newPassword,
      deviceId: f.deviceId,
      client: 'web',
    },
    randomUUID(),
  );
  expect(
    (await auth.authenticate(next.accessToken, f.deviceId)).user.role,
  ).toBe('admin');
  expect(
    await auth.db.auditLog.count({
      where: { actorId: f.user.id, action: 'staff.password_changed' },
    }),
  ).toBe(1);
  expect(
    (await auth.db.user.findUniqueOrThrow({ where: { id: f.user.id } }))
      .buyerPasswordHash,
  ).toBeNull();
});

it('staff password verification is bound to the chosen password and session and retains mandatory enrolled proof', async () => {
  const f = await account('manager');
  const secret = newTotpSecret();
  await auth.db.user.update({
    where: { id: f.user.id },
    data: { authenticatorEnabled: true },
  });
  await auth.db.staffCredential.update({
    where: { userId: f.user.id },
    data: { totpSecretCiphertext: encryptPii(secret, 'staff-totp') },
  });
  await auth.db.authSession.update({
    where: { id: f.identity.sessionId },
    data: { staffMfa: true },
  });
  const newPassword = 'Synthetic manager replacement password';
  const id = await passwordChallenge(f, newPassword);
  const input = {
    currentPassword: f.password,
    newPassword,
    securityChallengeId: id,
  };
  await expect(
    auth.changeStaffPassword(
      f.identity,
      { ...input, newPassword: newPassword + ' changed' },
      randomUUID(),
    ),
  ).rejects.toThrow();
  await expect(
    auth.changeStaffPassword(f.identity, input, randomUUID()),
  ).rejects.toMatchObject({ status: 422 });
  await auth.changeStaffPassword(
    f.identity,
    {
      ...input,
      factor: {
        method: 'authenticator',
        code: totpCode(secret, Math.floor(clock / 30000)),
      },
    },
    randomUUID(),
  );
  expect(
    (await auth.db.user.findUniqueOrThrow({ where: { id: f.user.id } }))
      .authenticatorEnabled,
  ).toBe(true);
});

it('staff password changes reject buyer identities, bad passwords, stale sessions and concurrent replay', async () => {
  const f = await account('support');
  const newPassword = 'Synthetic support replacement passphrase';
  const id = await passwordChallenge(f, newPassword);
  const input = {
    currentPassword: f.password,
    newPassword,
    securityChallengeId: id,
  };
  await expect(
    auth.changeStaffPassword(
      { ...f.identity, user: { ...f.identity.user, role: 'buyer' } },
      input,
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    auth.changeStaffPassword(
      f.identity,
      { ...input, currentPassword: 'wrong' },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 401 });
  const result = await Promise.allSettled([
    auth.changeStaffPassword(f.identity, input, randomUUID()),
    auth.changeStaffPassword(f.identity, input, randomUUID()),
  ]);
  expect(result.filter((value) => value.status === 'fulfilled')).toHaveLength(
    1,
  );
  expect(
    await auth.db.auditLog.count({
      where: { actorId: f.user.id, action: 'staff.password_changed' },
    }),
  ).toBe(1);
  await expect(
    auth.changeStaffPassword(f.identity, input, randomUUID()),
  ).rejects.toThrow();
});
beforeAll(async () => {
  const databaseUrl =
    process.env.STAFF_OPTIONAL_MFA_TEST_DATABASE_URL ??
    process.env.STAFF_ADMIN_TEST_DATABASE_URL;
  if (
    !databaseUrl ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(databaseUrl).pathname)
  )
    throw Error('Isolated staff database required');
  auth = new AuthService({
    databaseUrl,
    mode: 'local',
    now: () => clock,
    emailProvider: {
      async sendCode(email, code) {
        inbox.set(email, code);
      },
    },
  });
  security = new TwoFactorService(auth);
  unaffectedStaff = await account('support');
});
afterAll(async () => auth?.close());
async function account(role = 'admin') {
  const email = randomUUID() + '@example.test',
    password = 'Synthetic private staff passphrase 42',
    deviceId = randomUUID();
  const user = await auth.db.user.create({
    data: {
      name: 'Synthetic staff',
      role,
      emailVerifiedAt: new Date(),
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
      staffCredential: {
        create: { passwordHash: await hashStaffPassword(password) },
      },
    },
  });
  const signIn = () =>
    auth.staffSignIn(
      { email, password, deviceId, client: 'web' },
      randomUUID(),
    );
  const tokens = await signIn();
  const identity = await auth.authenticate(tokens.accessToken, deviceId);
  return { user, email, password, deviceId, signIn, identity };
}
it('allows admin and staff password-only sign-in before personal 2FA enrollment', async () => {
  for (const role of ['admin', 'manager', 'support']) {
    const f = await account(role);
    expect(await security.status(f.identity)).toMatchObject({
      enabled: false,
      mandatory: false,
    });
    expect(f.identity.permissions?.length).toBeGreaterThan(0);
  }
});
it('allows authorized password-only staff dashboard access without claiming MFA proof', async () => {
  const f = await account();
  const session = await auth.db.authSession.findUniqueOrThrow({
    where: { id: f.identity.sessionId },
  });
  expect(session).toMatchObject({
    staffAuthenticated: true,
    staffMfa: false,
    buyerMfa: false,
  });
  const ledger = new LedgerService(
    process.env.STAFF_OPTIONAL_MFA_TEST_DATABASE_URL ??
      process.env.STAFF_ADMIN_TEST_DATABASE_URL,
  );
  try {
    const service = new StaffAdminService(ledger, auth, {
      fenceEligibility: async () => {},
    });
    expect(
      (await service.dashboard(f.identity)).metrics.live,
    ).toBeGreaterThanOrEqual(0);
  } finally {
    await ledger.close();
  }
});
it('creates invited staff without authenticator setup or exposure of a secret', async () => {
  const owner = await account();
  const ledger = new LedgerService(
    process.env.STAFF_OPTIONAL_MFA_TEST_DATABASE_URL ??
      process.env.STAFF_ADMIN_TEST_DATABASE_URL,
  );
  try {
    const service = new StaffAdminService(ledger, auth, {
      fenceEligibility: async () => {},
    });
    const role = await auth.db.staffRole.findUniqueOrThrow({
      where: { key: 'manager' },
    });
    const email = randomUUID() + '@example.test';
    const invite = await service.invite(owner.identity, {
      idempotencyKey: randomUUID(),
      reason: 'Synthetic staff invitation',
      name: 'Invited warehouse staff',
      email,
      roleId: role.id,
    });
    if (!invite.invitationToken) throw Error('Missing synthetic invitation');
    expect(
      await service.enrollStart({ token: invite.invitationToken }),
    ).toEqual({ name: 'Invited warehouse staff', email });
    const password = 'Synthetic invited staff password 42';
    await service.enrollFinish({ token: invite.invitationToken, password });
    const deviceId = randomUUID();
    const token = await auth.staffSignIn(
      { email, password, deviceId, client: 'web' },
      randomUUID(),
    );
    expect(token.user.twoFactorEnabled).toBe(false);
    expect(
      (await auth.authenticate(token.accessToken, deviceId)).permissions,
    ).toContain('inventory.write');
    await expect(
      service.enrollFinish({ token: invite.invitationToken, password }),
    ).rejects.toMatchObject({ status: 400 });
  } finally {
    await ledger.close();
  }
});
it('finishes staff setup while the bid engine is paused, since a new account has no sessions to revoke', async () => {
  const owner = await account();
  const ledger = new LedgerService(
    process.env.STAFF_OPTIONAL_MFA_TEST_DATABASE_URL ??
      process.env.STAFF_ADMIN_TEST_DATABASE_URL,
  );
  // Enabled but never started: the state after a Redis restart awaiting
  // reviewed recovery, when every bid-engine call answers 503.
  const bids = new BidService(ledger, {
    enabled: true,
    prefix: `auction:test:paused:${randomUUID()}:`,
  });
  try {
    await expect(bids.revokeSessions([randomUUID()])).rejects.toMatchObject({
      status: 503,
    });
    await expect(bids.revokeSessions([])).resolves.toBeUndefined();
    const service = new StaffAdminService(ledger, auth, bids);
    const role = await auth.db.staffRole.findUniqueOrThrow({
      where: { key: 'admin' },
    });
    const email = randomUUID() + '@example.test';
    const invite = await service.invite(owner.identity, {
      idempotencyKey: randomUUID(),
      reason: 'Synthetic admin invitation',
      name: 'Invited admin',
      email,
      roleId: role.id,
    });
    if (!invite.invitationToken) throw Error('Missing synthetic invitation');
    const password = 'Synthetic invited admin password 42';
    await service.enrollFinish({ token: invite.invitationToken, password });
    const token = await auth.staffSignIn(
      { email, password, deviceId: randomUUID(), client: 'web' },
      randomUUID(),
    );
    expect(token.user.role).toBe('admin');
  } finally {
    await ledger.close();
  }
});
it('enables and disables only the signed-in account and enforces enrolled codes', async () => {
  const admin = await account(),
    other = await account('support');
  const start = await security.start(
    admin.identity,
    { purpose: 'enable', password: admin.password },
    randomUUID(),
  );
  const setup = await security.verifyEmail(
    admin.identity,
    { id: start.id, code: inbox.get(admin.email) ?? '' },
    randomUUID(),
  );
  if (!setup.secret) throw Error('Missing synthetic secret');
  await security.finish(
    admin.identity,
    {
      id: start.id,
      newCode: totpCode(setup.secret, Math.floor(clock / 30000)),
    },
    randomUUID(),
  );
  expect(await security.status(other.identity)).toMatchObject({
    enabled: false,
    mandatory: false,
  });
  await expect(admin.signIn()).rejects.toMatchObject({ status: 422 });
  await expect(
    auth.staffSignIn(
      {
        email: admin.email,
        password: 'wrong',
        deviceId: admin.deviceId,
        client: 'web',
      },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 401 });
  clock += 30000;
  const token = await auth.staffSignIn(
    {
      email: admin.email,
      password: admin.password,
      deviceId: admin.deviceId,
      client: 'web',
      code: totpCode(setup.secret, Math.floor(clock / 30000)),
    },
    randomUUID(),
  );
  const identity = await auth.authenticate(token.accessToken, admin.deviceId);
  const disable = await security.start(
    identity,
    { purpose: 'disable', password: admin.password },
    randomUUID(),
  );
  await security.verifyEmail(
    identity,
    { id: disable.id, code: inbox.get(admin.email) ?? '' },
    randomUUID(),
  );
  clock += 30000;
  await security.finish(
    identity,
    {
      id: disable.id,
      factor: {
        method: 'authenticator',
        code: totpCode(setup.secret, Math.floor(clock / 30000)),
      },
    },
    randomUUID(),
  );
  const fresh = await admin.signIn();
  expect(
    (await auth.authenticate(fresh.accessToken, admin.deviceId)).user
      .twoFactorEnabled,
  ).toBe(false);
  expect(await security.status(other.identity)).toMatchObject({
    enabled: false,
  });
});
