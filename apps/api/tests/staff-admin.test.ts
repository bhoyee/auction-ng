import { beforeAll, afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { LedgerService } from '../src/ledger/ledger-service';
import { AuthService, type AuthIdentity } from '../src/auth/auth-service';
import { StaffAdminService } from '../src/staff-admin/staff-admin-service';
import { encryptPii, decryptPii, hashPii } from '../src/security/pii';
import { profileSchema } from '@auction-ng/shared';
import { CatalogueService } from '../src/catalogue/catalogue-service';
import {
  hashStaffPassword,
  newTotpSecret,
  totpCode,
} from '../src/auth/staff-crypto';
let ledger: LedgerService, auth: AuthService, service: StaffAdminService;
beforeAll(() => {
  const url = process.env.STAFF_ADMIN_TEST_DATABASE_URL;
  if (!url || !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
    throw Error('Isolated staff admin database required');
  ledger = new LedgerService(url);
  auth = new AuthService({ databaseUrl: url });
  service = new StaffAdminService(ledger, auth, {
    fenceEligibility: async () => {},
  });
});
afterAll(async () => {
  await ledger?.close();
  await auth?.close();
});
async function staff(role = 'admin') {
  const email = randomUUID() + '@example.test';
  const user = await ledger.db.user.create({
    data: {
      name: 'Synthetic staff',
      role,
      authenticatorEnabled: true,
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
      emailVerifiedAt: new Date(),
      ...(role === 'buyer'
        ? {}
        : {
            staffCredential: {
              create: {
                passwordHash: 'synthetic-not-a-login-hash',
                totpSecretCiphertext: encryptPii(
                  'JBSWY3DPEHPK3PXP',
                  'staff-totp',
                ),
              },
            },
          }),
    },
  });
  const session = await ledger.db.authSession.create({
    data: {
      userId: user.id,
      client: 'web',
      staffMfa: true,
      familyId: randomUUID(),
      deviceHash: '0'.repeat(64),
      accessHash: hashPii(randomUUID(), 'access'),
      refreshHash: hashPii(randomUUID(), 'refresh'),
      accessExpiresAt: new Date(Date.now() + 900000),
      expiresAt: new Date(Date.now() + 900000),
    },
  });
  const who: AuthIdentity = {
    sessionId: session.id,
    user: profileSchema.parse({
      id: user.id,
      name: user.name,
      email,
      phone: null,
      phoneVerified: false,
      emailVerified: true,
      role,
      status: 'active',
    }),
  };
  return { user, who };
}
const command = () => ({
  idempotencyKey: randomUUID(),
  reason: 'Synthetic reviewed correction',
});

it('staff admin preserves the last administrator and denies stale or unauthorized role changes', async () => {
  const a = await staff(),
    m = await staff('manager');
  const input = {
    ...command(),
    name: 'Pickup specialist ' + randomUUID().slice(0, 8),
    permissions: ['pickup.manage'],
  };
  const managerRole = await ledger.db.staffRole.findUniqueOrThrow({
    where: { key: 'manager' },
  });
  await expect(
    service.assign(a.who, {
      ...command(),
      id: a.user.id,
      roleId: managerRole.id,
      expectedUpdatedAt: a.user.updatedAt.toISOString(),
    }),
  ).rejects.toThrow('Keep at least one active administrator');
  await expect(service.saveRole(m.who, input)).rejects.toMatchObject({
    status: 403,
  });
  const result = await service.saveRole(a.who, input);
  await expect(
    service.saveRole(a.who, {
      ...command(),
      id: result.id,
      name: 'Changed specialist',
      permissions: [],
      expectedRevision: 99,
    }),
  ).rejects.toMatchObject({ status: 409 });
});
it('staff admin blocks permission escalation and forbids deleting built-in roles', async () => {
  const a = await staff();
  await expect(
    service.saveRole(a.who, {
      ...command(),
      name: 'Root clone',
      permissions: ['staff.manage'],
    }),
  ).rejects.toThrow();
  const role = await ledger.db.staffRole.findUniqueOrThrow({
    where: { key: 'manager' },
  });
  await expect(
    service.archive(a.who, {
      ...command(),
      entity: 'role',
      id: role.id,
      operation: 'purge',
      expectedUpdatedAt: role.updatedAt.toISOString(),
    }),
  ).rejects.toThrow();
});

async function invoiceFixture() {
  const b = await staff('buyer'),
    wallet = await ledger.openWallet(b.user.id);
  await ledger.topup(
    {
      walletId: wallet.id,
      amountKobo: 500000n,
      idempotencyKey: randomUUID(),
      reference: randomUUID(),
    },
    'bank',
  );
  const category = await ledger.db.category.create({
    data: {
      name: `Synthetic electronics ${randomUUID().slice(0, 8)}`,
      slug: randomUUID(),
    },
  });
  const location = await ledger.db.location.create({
    data: {
      name: `Synthetic pickup ${randomUUID().slice(0, 8)}`,
      code: randomUUID().slice(0, 12),
      address: 'Synthetic address',
      hours: {},
      capacityPerSlot: 10,
    },
  });
  const lot = await ledger.db.lot.create({
    data: {
      title: 'Synthetic item',
      description: 'Synthetic test only',
      condition: 'new',
      status: 'closed',
      retailPriceKobo: 200000n,
      startPriceKobo: 100000n,
      categoryId: category.id,
      locationId: location.id,
      startAt: new Date(Date.now() - 7200000),
      endAt: new Date(Date.now() - 3600000),
    },
  });
  const invoice = await ledger.db.invoice.create({
    data: {
      userId: b.user.id,
      hammerTotalKobo: 100000n,
      premiumKobo: 0n,
      lotFeeKobo: 0n,
      vatKobo: 0n,
      totalKobo: 100000n,
      status: 'paid',
      lines: {
        create: {
          lotId: lot.id,
          hammerKobo: 100000n,
          premiumKobo: 0n,
          lotFeeKobo: 0n,
          vatKobo: 0n,
          totalKobo: 100000n,
        },
      },
    },
  });
  await ledger.debit({
    walletId: wallet.id,
    amountKobo: 100000n,
    idempotencyKey: randomUUID(),
    reference: 'settlement:debit:' + lot.id,
  });
  return { ...b, wallet, lot, invoice };
}
it('staff admin archives linked lots but refuses permanent deletion and buyer data access for managers', async () => {
  const a = await staff(),
    f = await invoiceFixture(),
    m = await staff('manager');
  await service.archive(a.who, {
    ...command(),
    entity: 'lot',
    id: f.lot.id,
    operation: 'archive',
    expectedUpdatedAt: f.lot.updatedAt.toISOString(),
  });
  const row = await ledger.db.lot.findUniqueOrThrow({
    where: { id: f.lot.id },
  });
  await expect(
    service.archive(a.who, {
      ...command(),
      entity: 'lot',
      id: row.id,
      operation: 'purge',
      expectedUpdatedAt: row.updatedAt.toISOString(),
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    service.records(m.who, { kind: 'buyers' }),
  ).rejects.toMatchObject({ status: 403 });
});
it('staff admin deletes only an unused archived draft and exact retries retain the result', async () => {
  const a = await staff(),
    f = await invoiceFixture();
  const draft = await ledger.db.lot.create({
    data: {
      title: 'Unused synthetic draft',
      description: 'Synthetic',
      condition: 'new',
      retailPriceKobo: 100000n,
      startPriceKobo: 50000n,
      categoryId: f.lot.categoryId,
      locationId: f.lot.locationId,
      startAt: new Date(Date.now() + 3600000),
      endAt: new Date(Date.now() + 7200000),
    },
  });
  await service.archive(a.who, {
    ...command(),
    entity: 'lot',
    id: draft.id,
    operation: 'archive',
    expectedUpdatedAt: draft.updatedAt.toISOString(),
  });
  const archived = await ledger.db.lot.findUniqueOrThrow({
      where: { id: draft.id },
    }),
    input = {
      ...command(),
      entity: 'lot',
      id: draft.id,
      operation: 'purge',
      expectedUpdatedAt: archived.updatedAt.toISOString(),
    };
  await service.archive(a.who, input);
  await service.archive(a.who, input);
  expect(
    await ledger.db.lot.findUnique({ where: { id: draft.id } }),
  ).toBeNull();
});
it('staff admin fences changed role assignments and enforces empty custom permissions', async () => {
  const a = await staff(),
    m = await staff('manager');
  const role = await service.saveRole(a.who, {
    ...command(),
    name: 'No privileges ' + randomUUID().slice(0, 8),
    permissions: [],
  });
  await service.assign(a.who, {
    ...command(),
    id: m.user.id,
    roleId: role.id,
    expectedUpdatedAt: m.user.updatedAt.toISOString(),
  });
  await expect(service.dashboard(m.who)).rejects.toMatchObject({ status: 403 });
});
it('staff admin refuses expired and reused setup links and invalidates links when reissued', async () => {
  const a = await staff();
  const role = await ledger.db.staffRole.findUniqueOrThrow({
    where: { key: 'manager' },
  });
  const email = randomUUID() + '@example.test';
  const first = await service.invite(a.who, {
    ...command(),
    name: 'Synthetic invited staff',
    email,
    roleId: role.id,
  });
  expect(first.invitationToken).toBeTruthy();
  const firstSetup = { token: first.invitationToken };
  expect((await service.enrollStart(firstSetup)).email).toBe(email);
  const second = await service.invite(a.who, {
    ...command(),
    name: 'Synthetic invited staff',
    email,
    roleId: role.id,
  });
  expect(second.id).toBe(first.id);
  await expect(service.enrollStart(firstSetup)).rejects.toMatchObject({
    status: 400,
  });
  await ledger.db.staffInvitation.updateMany({
    where: { userId: first.id, usedAt: null },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await expect(
    service.enrollStart({ token: second.invitationToken }),
  ).rejects.toMatchObject({ status: 400 });
});
it('staff admin requires an unexpired MFA session even when the role is admin', async () => {
  const a = await staff();
  await ledger.db.authSession.update({
    where: { id: a.who.sessionId },
    data: { staffMfa: false },
  });
  await expect(service.dashboard(a.who)).rejects.toMatchObject({ status: 401 });
});
it('staff admin cursor cannot be reused for a different list scope', async () => {
  const a = await staff();
  const page = await service.records(a.who, { kind: 'staff', limit: 1 });
  expect(page.nextCursor).toBeTruthy();
  await expect(
    service.records(a.who, {
      kind: 'buyers',
      limit: 1,
      cursor: page.nextCursor,
    }),
  ).rejects.toMatchObject({ status: 400 });
});
it('staff admin imports twenty validated drafts atomically and preserves retry identity', async () => {
  const a = await staff('manager'),
    f = await invoiceFixture();
  const catalogue = new CatalogueService(
    process.env.STAFF_ADMIN_TEST_DATABASE_URL,
  );
  const intake = new StaffAdminService(
    ledger,
    auth,
    { fenceEligibility: async () => {} },
    catalogue,
  );
  try {
    const supplier = await ledger.db.supplier.create({
      data: { name: 'Supplier ' + randomUUID(), type: 'retailer' },
    });
    const batch = await ledger.db.batch.create({
      data: {
        name: 'Test batch',
        supplierId: supplier.id,
        locationId: f.lot.locationId,
        boughtOn: new Date(),
        itemsExpected: 20,
        costSupplierKobo: 1_000_000n,
      },
    });
    const rows = Array.from({ length: 20 }, (_, i) => ({
      batchId: batch.id,
      title: 'Batch ' + randomUUID() + ' ' + i,
      description: 'Synthetic accurate condition notes',
      condition: 'new',
      retailPriceKobo: 1000000,
      startPriceKobo: 50000,
      categoryId: f.lot.categoryId,
      locationId: f.lot.locationId,
      startsAt: new Date(Date.now() + 3600000).toISOString(),
      endsAt: new Date(Date.now() + 7200000).toISOString(),
    }));
    const input = { ...command(), rows };
    await intake.importDrafts(a.who, input);
    await intake.importDrafts(a.who, input);
    expect(
      await ledger.db.lot.count({
        where: { title: { in: rows.map((r) => r.title) } },
      }),
    ).toBe(20);
    const invalid = rows.map((r, i) => ({
      ...r,
      title: 'Rollback ' + randomUUID(),
      ...(i === 19 ? { categoryId: randomUUID() } : {}),
    }));
    await expect(
      intake.importDrafts(a.who, { ...command(), rows: invalid }),
    ).rejects.toThrow();
    expect(
      await ledger.db.lot.count({
        where: { title: { in: invalid.map((r) => r.title) } },
      }),
    ).toBe(0);
  } finally {
    await catalogue.db.$disconnect();
  }
});

it('hides selected administrators before directory search, pagination and role display counts, retaining access and audit identity', async () => {
  const operator = await staff(),
    hidden = await staff(),
    visible = await staff();
  const prefix = 'Directory ' + randomUUID();
  await ledger.db.user.updateMany({
    where: { id: { in: [hidden.user.id, visible.user.id] } },
    data: { name: prefix },
  });
  const role = await ledger.db.staffRole.findUniqueOrThrow({
    where: { key: 'admin' },
  });
  for (const user of [hidden.user, visible.user])
    await ledger.db.staffMembership.create({
      data: { userId: user.id, roleId: role.id },
    });
  const before = await service.records(operator.who, {
    kind: 'roles',
    search: role.name,
  });
  const input = {
    email: hidden.who.user.email,
    hidden: true,
    reason: 'Developer account excluded from staff directory',
  };
  expect(
    await service.setDirectoryVisibility(operator.who, input),
  ).toMatchObject({ changed: true });
  const page = await service.records(operator.who, {
    kind: 'staff',
    search: prefix,
    limit: 1,
  });
  expect(page.items.map((row) => row.id)).toEqual([visible.user.id]);
  expect(page.nextCursor).toBeNull();
  const after = await service.records(operator.who, {
    kind: 'roles',
    search: role.name,
  });
  const count = (text: string | undefined) => Number(text?.split(' ')[0]);
  expect(count(after.items.find((row) => row.id === role.id)?.detail)).toBe(
    count(before.items.find((row) => row.id === role.id)?.detail) - 1,
  );
  expect((await service.me(hidden.who)).permissions).toContain('staff.manage');
  const password = 'Synthetic directory login passphrase';
  const secret = newTotpSecret();
  await ledger.db.staffCredential.update({
    where: { userId: hidden.user.id },
    data: {
      passwordHash: await hashStaffPassword(password),
      totpSecretCiphertext: encryptPii(secret, 'staff-totp'),
    },
  });
  const deviceId = randomUUID();
  await expect(
    auth.staffSignIn(
      { email: hidden.who.user.email, password, deviceId, client: 'web' },
      randomUUID(),
    ),
  ).rejects.toMatchObject({
    status: 422,
    response: { code: 'TWO_FACTOR_REQUIRED' },
  });
  const signedIn = await auth.staffSignIn(
    {
      email: hidden.who.user.email,
      password,
      deviceId,
      client: 'web',
      code: totpCode(secret, Math.floor(Date.now() / 30000)),
    },
    randomUUID(),
  );
  expect(
    (await auth.authenticate(signedIn.accessToken, deviceId)).user.id,
  ).toBe(hidden.user.id);
  const audit = await ledger.db.auditLog.findFirstOrThrow({
    where: {
      action: 'staff.directory_visibility_changed',
      entityId: hidden.user.id,
    },
  });
  expect(audit.actorId).toBe(operator.user.id);
  expect(
    JSON.parse(decryptPii(Buffer.from(audit.afterCiphertext ?? []), 'audit')),
  ).toMatchObject({ hiddenFromStaffDirectory: true, reason: input.reason });
  const history = await service.records(operator.who, {
    kind: 'audit',
    search: hidden.user.id,
  });
  expect(history.items.some((row) => row.id === audit.id)).toBe(true);
  expect(
    history.items.some((row) => row.detail?.includes(hidden.user.id)),
  ).toBe(true);
  const retries = await Promise.all([
    service.setDirectoryVisibility(operator.who, input),
    service.setDirectoryVisibility(operator.who, input),
  ]);
  expect(retries.map((result) => result.changed)).toEqual([false, false]);
  expect(
    await ledger.db.auditLog.count({
      where: {
        action: 'staff.directory_visibility_changed',
        entityId: hidden.user.id,
      },
    }),
  ).toBe(1);
  await service.setDirectoryVisibility(operator.who, {
    ...input,
    hidden: false,
  });
  expect(
    (
      await service.records(operator.who, { kind: 'staff', search: prefix })
    ).items.map((row) => row.id),
  ).toContain(hidden.user.id);
});

it('visibility changes reject buyers, unknown fields, non-admin operators and expired sessions', async () => {
  const operator = await staff(),
    manager = await staff('manager'),
    buyer = await staff('buyer');
  const input = {
    email: buyer.who.user.email,
    hidden: true,
    reason: 'Operator visibility validation',
  };
  await expect(
    service.setDirectoryVisibility(operator.who, input),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    service.setDirectoryVisibility(manager.who, {
      ...input,
      email: operator.who.user.email,
    }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    service.setDirectoryVisibility(operator.who, { ...input, extra: true }),
  ).rejects.toThrow();
  await ledger.db.authSession.update({
    where: { id: operator.who.sessionId },
    data: { staffMfa: false },
  });
  await expect(
    service.setDirectoryVisibility(operator.who, {
      ...input,
      email: operator.who.user.email,
    }),
  ).rejects.toMatchObject({ status: 401 });
  await ledger.db.authSession.update({
    where: { id: operator.who.sessionId },
    data: { revokedAt: new Date() },
  });
  await expect(
    service.setDirectoryVisibility(operator.who, {
      ...input,
      email: operator.who.user.email,
    }),
  ).rejects.toMatchObject({ status: 401 });
});
