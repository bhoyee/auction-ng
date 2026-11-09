import { beforeAll, afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { AuthService } from '../src/auth/auth-service';
import { TwoFactorService } from '../src/auth/two-factor-service';
import { hashStaffPassword, totpCode } from '../src/auth/staff-crypto';
import { encryptPii, hashPii } from '../src/security/pii';
import { LedgerService } from '../src/ledger/ledger-service';
import { StaffAdminService } from '../src/staff-admin/staff-admin-service';
import { createStaffSignIn } from './staff-sign-in-helper';
const staffSignIn = createStaffSignIn(
  () => auth,
  () => inbox,
);
let auth: AuthService, security: TwoFactorService;
let clock = Date.now();
const inbox = new Map<string, string>();
beforeAll(() => {
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
    staffSignIn({ email, password, deviceId, client: 'web' }, randomUUID());
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
    const token = await staffSignIn(
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
    staffSignIn(
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
  const token = await staffSignIn(
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
