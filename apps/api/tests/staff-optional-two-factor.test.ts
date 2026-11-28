import { beforeAll, afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { AuthService } from '../src/auth/auth-service';
import { TwoFactorService } from '../src/auth/two-factor-service';
import {
  hashStaffPassword,
  newTotpSecret,
  totpCode,
} from '../src/auth/staff-crypto';
import { decryptPii, encryptPii, hashPii } from '../src/security/pii';
import { NotificationService } from '../src/closing/notification-service';
import { LedgerService } from '../src/ledger/ledger-service';
import { StaffAdminService } from '../src/staff-admin/staff-admin-service';
import { BidService } from '../src/bids/bid-service';
import { staffInviteEmail } from '../src/staff-admin/staff-invite-email';
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
it('edits and deletes an invitation never set up, then invites the same email again; set-up accounts are kept', async () => {
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
      where: { key: 'admin' },
    });
    const email = randomUUID() + '@example.test';
    const command = (reason: string) => ({
      idempotencyKey: randomUUID(),
      reason,
    });
    const first = await service.invite(owner.identity, {
      ...command('Synthetic admin invitation'),
      name: 'Test Admin',
      email,
      roleId: role.id,
    });
    // The setup link is emailed to the invited address.
    const queued = await auth.db.notification.findMany({
      where: { userId: first.id, template: 'staff-invite-v1' },
    });
    expect(queued).toHaveLength(1);
    const mail = staffInviteEmail(
      (
        JSON.parse(
          decryptPii(
            Buffer.from(queued[0]?.payloadCiphertext ?? new Uint8Array()),
            'notification',
          ),
        ) as { message: unknown }
      ).message,
    );
    expect(mail.Subject).toBe(
      'You’re invited to the GiddyDeal staff workspace',
    );
    expect(mail.HTML).toContain('Hello Test,');
    expect(mail.HTML).toContain('as Admin');
    expect(mail.Text).toContain('/enroll#' + first.invitationToken);
    // Sent once to that address; the one-time link is then not kept.
    const sent: { to: string; subject: string }[] = [];
    const mailer = new NotificationService(
      ledger,
      {
        async send(to: string, message: { Subject: string }) {
          sent.push({ to, subject: message.Subject });
        },
      } as never,
      { savedSearchesEnabled: false },
    );
    await mailer.deliver();
    await mailer.deliver();
    expect(sent.filter((m) => m.to === email)).toHaveLength(1);
    const stored = await auth.db.notification.findUniqueOrThrow({
      where: { id: queued[0]?.id ?? '' },
    });
    expect(stored.status).toBe('sent');
    expect(
      decryptPii(Buffer.from(stored.payloadCiphertext), 'notification'),
    ).not.toContain(first.invitationToken ?? 'missing');
    const row = async () =>
      (
        await service.records(owner.identity, {
          kind: 'staff',
          search: 'Admin Renamed',
        })
      ).items.find((item) => item.id === first.id);
    const before = await auth.db.user.findUniqueOrThrow({
      where: { id: first.id },
    });
    await service.rename(owner.identity, {
      ...command('Fix the spelling of the name'),
      id: first.id,
      name: 'Test Admin Renamed',
      expectedUpdatedAt: before.updatedAt.toISOString(),
    });
    const listed = await row();
    expect(listed).toMatchObject({
      title: 'Test Admin Renamed',
      status: 'invited',
    });
    await service.archive(owner.identity, {
      ...command('Remove the test invitation'),
      entity: 'user',
      id: first.id,
      operation: 'purge',
      expectedUpdatedAt: listed?.updatedAt,
    });
    expect(
      await auth.db.user.findUnique({ where: { id: first.id } }),
    ).toBeNull();
    // Deleting is audited, and the rename was too.
    for (const action of ['staff.record_purge', 'staff.staff_renamed'])
      expect(
        await auth.db.auditLog.count({
          where: { entityId: first.id, action },
        }),
      ).toBe(1);
    // The same email can be invited again and set up.
    const again = await service.invite(owner.identity, {
      ...command('Invite again after deleting the test'),
      name: 'Test Admin',
      email,
      roleId: role.id,
    });
    if (!again.invitationToken) throw Error('Missing synthetic invitation');
    await service.enrollFinish({
      token: again.invitationToken,
      password: 'Synthetic invited admin password 42',
    });
    // Already used before the email went out: it is not sent.
    await mailer.deliver();
    expect(sent.filter((m) => m.to === email)).toHaveLength(1);
    expect(
      (
        await auth.db.notification.findFirstOrThrow({
          where: { userId: again.id, template: 'staff-invite-v1' },
        })
      ).status,
    ).toBe('failed');
    // A set-up account can't be deleted, only archived.
    const enrolled = await auth.db.user.findUniqueOrThrow({
      where: { id: again.id },
    });
    await expect(
      service.archive(owner.identity, {
        ...command('Try to delete a real account'),
        entity: 'user',
        id: again.id,
        operation: 'purge',
        expectedUpdatedAt: enrolled.updatedAt.toISOString(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await auth.db.user.findUnique({ where: { id: again.id } }),
    ).not.toBeNull();
  } finally {
    await ledger.close();
  }
});
it('re-invites an archived invitation that was never set up, with the new name and role', async () => {
  const owner = await account();
  const ledger = new LedgerService(
    process.env.STAFF_OPTIONAL_MFA_TEST_DATABASE_URL ??
      process.env.STAFF_ADMIN_TEST_DATABASE_URL,
  );
  try {
    const service = new StaffAdminService(ledger, auth, {
      fenceEligibility: async () => {},
    });
    const [admin, manager] = await Promise.all([
      auth.db.staffRole.findUniqueOrThrow({ where: { key: 'admin' } }),
      auth.db.staffRole.findUniqueOrThrow({ where: { key: 'manager' } }),
    ]);
    const email = randomUUID() + '@example.test';
    const command = (reason: string) => ({
      idempotencyKey: randomUUID(),
      reason,
    });
    const first = await service.invite(owner.identity, {
      ...command('Synthetic invitation to archive'),
      name: 'First Name',
      email,
      roleId: manager.id,
    });
    const created = await auth.db.user.findUniqueOrThrow({
      where: { id: first.id },
    });
    await service.archive(owner.identity, {
      ...command('Archive the unused invitation'),
      entity: 'user',
      id: first.id,
      operation: 'archive',
      expectedUpdatedAt: created.updatedAt.toISOString(),
    });
    const again = await service.invite(owner.identity, {
      ...command('Invite the same email again'),
      name: 'Second Name',
      email,
      roleId: admin.id,
    });
    expect(again.id).toBe(first.id);
    const reused = await auth.db.user.findUniqueOrThrow({
      where: { id: first.id },
      include: { staffMembership: true },
    });
    expect(reused).toMatchObject({
      name: 'Second Name',
      role: 'admin',
      archivedAt: null,
      status: 'suspended',
    });
    expect(reused.staffMembership?.roleId).toBe(admin.id);
    // Only the newest link works.
    if (!first.invitationToken || !again.invitationToken)
      throw Error('Missing synthetic invitation');
    await expect(
      service.enrollStart({ token: first.invitationToken }),
    ).rejects.toMatchObject({ status: 400 });
    await service.enrollFinish({
      token: again.invitationToken,
      password: 'Synthetic invited admin password 42',
    });
    // Set up now: inviting it again is refused with a clear reason.
    await expect(
      service.invite(owner.identity, {
        ...command('Invite a set-up account again'),
        name: 'Second Name',
        email,
        roleId: admin.id,
      }),
    ).rejects.toMatchObject({ status: 409 });
  } finally {
    await ledger.close();
  }
});
it('resends an invite with a new link and changes an invite email; set-up accounts keep theirs', async () => {
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
    const command = (reason: string) => ({
      idempotencyKey: randomUUID(),
      reason,
    });
    const email = randomUUID() + '@example.test';
    const first = await service.invite(owner.identity, {
      ...command('Synthetic invitation to resend'),
      name: 'Resend Person',
      email,
      roleId: role.id,
    });
    const fresh = async (id: string) =>
      (
        await auth.db.user.findUniqueOrThrow({ where: { id } })
      ).updatedAt.toISOString();
    // The row carries the invited address for the edit form.
    const listed = (
      await service.records(owner.identity, {
        kind: 'staff',
        search: 'Resend Person',
      })
    ).items.find((item) => item.id === first.id);
    expect(listed?.email).toBe(email);
    const resent = await service.reinvite(owner.identity, {
      ...command('Resend the setup link'),
      id: first.id,
      expectedUpdatedAt: await fresh(first.id),
    });
    if (!first.invitationToken || !resent.invitationToken)
      throw Error('Missing synthetic invitation');
    expect(resent.invitationToken).not.toBe(first.invitationToken);
    await expect(
      service.enrollStart({ token: first.invitationToken }),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      await service.enrollStart({ token: resent.invitationToken }),
    ).toEqual({ name: 'Resend Person', email });
    expect(
      await auth.db.notification.count({
        where: { userId: first.id, template: 'staff-invite-v1' },
      }),
    ).toBe(2);
    // Changing an invite's email sends a new link to the new address.
    const changed = randomUUID() + '@example.test';
    const edited = await service.rename(owner.identity, {
      ...command('Fix the email address'),
      id: first.id,
      name: 'Resend Person',
      email: changed,
      expectedUpdatedAt: await fresh(first.id),
    });
    if (!edited.invitationToken) throw Error('Missing new invitation');
    await expect(
      service.enrollStart({ token: resent.invitationToken }),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      await service.enrollStart({ token: edited.invitationToken }),
    ).toEqual({ name: 'Resend Person', email: changed });
    // An email already in use is refused.
    await expect(
      service.rename(owner.identity, {
        ...command('Use an email that is taken'),
        id: first.id,
        name: 'Resend Person',
        email: owner.email,
        expectedUpdatedAt: await fresh(first.id),
      }),
    ).rejects.toMatchObject({ status: 409 });
    // Once set up, the sign-in email stays and resending is refused.
    await service.enrollFinish({
      token: edited.invitationToken,
      password: 'Synthetic invited staff password 42',
    });
    await expect(
      service.rename(owner.identity, {
        ...command('Try to change a set-up email'),
        id: first.id,
        name: 'Resend Person',
        email: randomUUID() + '@example.test',
        expectedUpdatedAt: await fresh(first.id),
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.reinvite(owner.identity, {
        ...command('Try to resend after setup'),
        id: first.id,
        expectedUpdatedAt: await fresh(first.id),
      }),
    ).rejects.toMatchObject({ status: 409 });
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
