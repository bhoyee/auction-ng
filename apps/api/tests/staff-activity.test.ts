import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { profileSchema } from '@auction-ng/shared';
import { LedgerService } from '../src/ledger/ledger-service';
import { AuthService, type AuthIdentity } from '../src/auth/auth-service';
import { createApi } from '../src/app';
import { createStaffAdminClient } from '../../../packages/api-client/src/staff-admin';
import { UnauthorizedException } from '@nestjs/common';
import { StaffActivityService } from '../src/staff-admin/staff-activity-service';
import { NotificationService } from '../src/closing/notification-service';
import { staffActivityEmail } from '../src/staff-admin/staff-activity-email';
import { encryptPii, hashPii } from '../src/security/pii';
let ledger: LedgerService, activity: StaffActivityService;
const priorRedis = process.env.REDIS_URL;
beforeAll(() => {
  const url =
    process.env.STAFF_ACTIVITY_TEST_DATABASE_URL ??
    process.env.STAFF_ADMIN_TEST_DATABASE_URL;
  if (!url || !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
    throw Error('Isolated staff activity database required');
  process.env.REDIS_URL = '';
  process.env.EXPO_PUSH_ENABLED = 'false';
  ledger = new LedgerService(url);
  activity = new StaffActivityService(ledger);
});
afterAll(async () => {
  process.env.REDIS_URL = priorRedis;
  await ledger?.close();
});
async function account(role = 'admin') {
  const email = randomUUID() + '@example.test';
  const user = await ledger.db.user.create({
    data: {
      name: 'Synthetic activity ' + role,
      role,
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
      emailVerifiedAt: new Date(),
      ...(role === 'buyer'
        ? {}
        : {
            staffCredential: {
              create: { passwordHash: 'synthetic-unusable-login-hash' },
            },
          }),
    },
  });
  const who: AuthIdentity = {
    sessionId: randomUUID(),
    user: profileSchema.parse({
      id: user.id,
      name: user.name,
      role,
      status: 'active',
      phoneVerified: false,
      emailVerified: true,
      email,
      phone: null,
    }),
  };
  return { user, who, email };
}
async function conversation(buyerId: string, review = false) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const number =
    'SUP-' +
    Array.from(randomBytes(8), (b) => alphabet[b % alphabet.length]).join('');
  return ledger.db.supportConversation.create({
    data: {
      number,
      buyerId,
      createdById: buyerId,
      createKey: randomUUID(),
      requestHash: '0'.repeat(64),
      subjectCiphertext: encryptPii(
        'Synthetic support request',
        'support-text',
      ),
      referenceCiphertext: encryptPii('Synthetic reference', 'support-text'),
      topic: 'bidding',
      mode: 'human',
      ...(review ? { bidCancellationFeeConsentAt: new Date() } : {}),
    },
  });
}
it('captures committed support requests once, routes by capability and blocks buyers', async () => {
  const admin = await account(),
    support = await account('support'),
    manager = await account('manager'),
    buyer = await account('buyer');
  const request = await conversation(buyer.user.id);
  await Promise.all([activity.flush(), activity.flush(), activity.flush()]);
  const adminRows = (await activity.inbox(admin.who, {})).items,
    supportRows = (await activity.inbox(support.who, {})).items;
  expect(adminRows.some((r) => r.description.includes(request.number))).toBe(
    true,
  );
  expect(supportRows.some((r) => r.description.includes(request.number))).toBe(
    true,
  );
  expect((await activity.inbox(manager.who, {})).items).toHaveLength(0);
  expect(
    await ledger.db.notification.count({
      where: { userId: admin.user.id, template: 'staff-activity-v1' },
    }),
  ).toBe(1);
  await expect(activity.inbox(buyer.who, {})).rejects.toMatchObject({
    status: 403,
  });
});
it('rolls back activity with the source transaction and never creates a false support alert', async () => {
  const buyer = await account('buyer');
  const before = await ledger.db.staffActivityEvent.count();
  await expect(
    ledger.db.$transaction(async (tx) => {
      await tx.supportConversation.create({
        data: {
          number: 'SUP-ABCDEFGH',
          buyerId: buyer.user.id,
          createdById: buyer.user.id,
          createKey: randomUUID(),
          requestHash: '0'.repeat(64),
          subjectCiphertext: encryptPii('Synthetic', 'support-text'),
          referenceCiphertext: encryptPii('Synthetic', 'support-text'),
          topic: 'bidding',
          mode: 'human',
        },
      });
      throw Error('Rollback synthetic request');
    }),
  ).rejects.toThrow('Rollback');
  expect(await ledger.db.staffActivityEvent.count()).toBe(before);
});
it('routes paid auction wins to auction staff and bid cancellation reviews to authorized reviewers', async () => {
  const admin = await account(),
    manager = await account('manager'),
    support = await account('support'),
    buyer = await account('buyer');
  const invoice = await ledger.db.invoice.create({
    data: {
      userId: buyer.user.id,
      status: 'paid',
      hammerTotalKobo: 100000n,
      premiumKobo: 0n,
      lotFeeKobo: 0n,
      vatKobo: 0n,
      totalKobo: 100000n,
    },
  });
  const request = await conversation(buyer.user.id, true);
  await activity.flush();
  expect(
    (await activity.inbox(manager.who, {})).items.some((r) =>
      r.description.includes(invoice.number),
    ),
  ).toBe(true);
  const root = (await activity.inbox(admin.who, {})).items;
  expect(
    root.some(
      (r) =>
        r.title === 'Bid cancellation awaiting review' &&
        r.description.includes(request.number),
    ),
  ).toBe(true);
  expect(
    (await activity.inbox(support.who, {})).items.some(
      (r) =>
        r.description.includes(request.number) ||
        r.description.includes(invoice.number),
    ),
  ).toBe(false);
});
it('keeps read state private and idempotent and provides cursor-based pages', async () => {
  const a = await account(),
    b = await account('support'),
    buyer = await account('buyer');
  for (let i = 0; i < 3; i++) await conversation(buyer.user.id);
  await activity.flush();
  const first = await activity.inbox(a.who, { limit: 1 });
  expect(first.nextCursor).toBeTruthy();
  const second = await activity.inbox(a.who, {
    limit: 1,
    cursor: first.nextCursor,
  });
  expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
  const id = first.items[0]?.id;
  if (!id) throw Error('Missing synthetic alert');
  expect(await activity.read(b.who, { ids: [id] })).toEqual({ updated: 0 });
  expect(await activity.read(a.who, { ids: [id] })).toEqual({ updated: 1 });
  expect(await activity.read(a.who, { ids: [id] })).toEqual({ updated: 0 });
  expect((await activity.inbox(a.who, {})).unreadCount).toBe(
    first.unreadCount - 1,
  );
  await expect(
    activity.inbox(b.who, { cursor: first.nextCursor }),
  ).rejects.toMatchObject({ status: 400 });
});
it('alerts withdrawal reviewers without moving or releasing reserved wallet funds', async () => {
  const finance = await account('finance'),
    manager = await account('manager'),
    buyer = await account('buyer');
  const wallet = await ledger.openWallet(buyer.user.id);
  await ledger.topup(
    {
      walletId: wallet.id,
      amountKobo: 200000n,
      idempotencyKey: randomUUID(),
      reference: randomUUID(),
    },
    'bank',
  );
  const holdId = randomUUID();
  await ledger.hold({
    walletId: wallet.id,
    holdId,
    amountKobo: 101000n,
    idempotencyKey: randomUUID(),
    reference: randomUUID(),
  });
  const session = await ledger.db.authSession.create({
    data: {
      userId: buyer.user.id,
      buyerMfa: true,
      client: 'web',
      familyId: randomUUID(),
      deviceHash: '0'.repeat(64),
      accessHash: randomBytes(32).toString('hex'),
      refreshHash: randomBytes(32).toString('hex'),
      accessExpiresAt: new Date(Date.now() + 900000),
      expiresAt: new Date(Date.now() + 900000),
    },
  });
  const bank = await ledger.db.withdrawalBank.create({
    data: {
      userId: buyer.user.id,
      accountHash: randomBytes(32).toString('hex'),
      detailsCiphertext: encryptPii('Synthetic bank', 'withdrawal-bank'),
      status: 'verified',
      verifiedAt: new Date(),
    },
  });
  const request = await ledger.db.withdrawal.create({
    data: {
      id: randomUUID(),
      userId: buyer.user.id,
      walletId: wallet.id,
      bankId: bank.id,
      sessionId: session.id,
      requestKey: randomUUID(),
      requestHash: '0'.repeat(64),
      reference: 'synthetic-' + randomUUID(),
      amountKobo: 100000n,
      feeKobo: 1000n,
      levyKobo: 0n,
      totalKobo: 101000n,
      holdId,
      status: 'review',
      reviewRequired: true,
      passwordSnapshot: 'synthetic',
      codeHash: '0'.repeat(64),
      codeCiphertext: encryptPii('synthetic', 'withdrawal-code'),
      expiresAt: new Date(Date.now() + 300000),
      confirmedAt: new Date(),
    },
  });
  const before = await ledger.balances(wallet.id);
  await activity.flush();
  expect(
    (await activity.inbox(finance.who, {})).items.some(
      (r) =>
        r.title === 'Withdrawal awaiting approval' &&
        r.description.includes(request.reference),
    ),
  ).toBe(true);
  expect(
    (await activity.inbox(manager.who, {})).items.some((r) =>
      r.description.includes(request.reference),
    ),
  ).toBe(false);
  expect(await ledger.balances(wallet.id)).toEqual(before);
});
it('delivers professional email separately from read state and suppresses revoked access', async () => {
  const staff = await account('support'),
    buyer = await account('buyer');
  await conversation(buyer.user.id);
  await activity.flush();
  const rows = (await activity.inbox(staff.who, {})).items;
  expect(rows[0]?.emailStatus).toBe('pending');
  expect(rows[0]?.emailMode).toBe('preview');
  const id = rows[0]?.id;
  if (!id) throw Error('Missing synthetic alert');
  await activity.read(staff.who, { ids: [id] });
  const sent: string[] = [];
  const notifier = new NotificationService(ledger, {
    async send(to, message) {
      sent.push(to);
      expect(message.HTML).not.toContain('Synthetic support request');
      expect(message.Subject).toContain('LotVanta');
    },
  });
  for (let i = 0; i < 4; i++) await notifier.deliver(true);
  expect(sent).toContain(staff.email);
  expect((await activity.inbox(staff.who, {})).items[0]).toMatchObject({
    emailStatus: 'sent',
    emailMode: 'preview',
    readAt: expect.any(String),
  });
  const revoked = await account('support');
  await conversation(buyer.user.id);
  await activity.flush();
  await ledger.db.user.update({
    where: { id: revoked.user.id },
    data: { status: 'suspended' },
  });
  for (let i = 0; i < 4; i++) await notifier.deliver(true);
  expect(sent).not.toContain(revoked.email);
  await expect(activity.inbox(revoked.who, {})).rejects.toMatchObject({
    status: 403,
  });
  const previousMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = 'smtp';
  try {
    const inbox = await activity.inbox(staff.who, {});
    expect(inbox.emailMode).toBe('smtp');
    expect(inbox.items.find((r) => r.id === id)?.emailMode).toBe('preview');
  } finally {
    process.env.AUTH_MODE = previousMode;
  }
});
it('escapes staff email content and rejects external action links', () => {
  const mail = staffActivityEmail({
    title: 'Review <unsafe>',
    description: 'Request & update',
    href: '/?section=finance',
  });
  expect(mail.HTML).toContain('&lt;unsafe&gt;');
  expect(mail.HTML).not.toContain('<unsafe>');
  expect(() =>
    staffActivityEmail({
      title: 'Test',
      description: 'Test',
      href: 'https://example.test/',
    }),
  ).toThrow();
});
it('protects the typed HTTP inbox and strictly validates read requests', async () => {
  const staff = await account(),
    buyer = await account('buyer');
  await conversation(buyer.user.id);
  await activity.flush();
  const app = await createApi({
    databaseUrl:
      process.env.STAFF_ACTIVITY_TEST_DATABASE_URL ??
      process.env.STAFF_ADMIN_TEST_DATABASE_URL,
    mode: 'local',
    emailProvider: { async sendCode() {} },
  });
  vi.spyOn(app.get(AuthService), 'authenticate').mockImplementation(
    async (token) => {
      if (token === 'synthetic-staff') return staff.who;
      if (token === 'synthetic-buyer') return buyer.who;
      throw new UnauthorizedException();
    },
  );
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl(),
    deviceId = randomUUID();
  try {
    expect((await fetch(url + '/staff/notifications')).status).toBe(401);
    const client = createStaffAdminClient(url, {
      accessToken: 'synthetic-staff',
      deviceId,
    });
    const page = await client.notifications();
    expect(page.items.length).toBeGreaterThan(0);
    await expect(
      createStaffAdminClient(url, {
        accessToken: 'synthetic-buyer',
        deviceId,
      }).notifications(),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (
        await fetch(url + '/staff/notifications/read', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer synthetic-staff',
            'X-Device-Id': deviceId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ids: page.items.map((r) => r.id),
            userId: buyer.user.id,
          }),
        })
      ).status,
    ).toBe(400);
    expect(
      (await client.readNotifications(page.items.map((r) => r.id))).updated,
    ).toBe(page.items.length);
    const response = await fetch(url + '/docs-json');
    const docs: unknown = await response.json();
    expect(docs).toMatchObject({
      paths: {
        '/staff/notifications': { get: expect.any(Object) },
        '/staff/notifications/read': { post: expect.any(Object) },
      },
    });
  } finally {
    await app.close();
  }
});
