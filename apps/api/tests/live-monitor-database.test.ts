import { beforeAll, afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { LedgerService } from '../src/ledger/ledger-service';
import { AuthService, type AuthIdentity } from '../src/auth/auth-service';
import { StaffAdminService } from '../src/staff-admin/staff-admin-service';
import { LiveMonitorService } from '../src/staff-admin/live-monitor-service';
import { BidService } from '../src/bids/bid-service';
import { encryptPii, decryptPii, hashPii } from '../src/security/pii';
import { profileSchema } from '@auction-ng/shared';
let ledger: LedgerService, categoryId: string, locationId: string;
let auth: AuthService, monitor: LiveMonitorService;
const startAt = new Date('2026-11-07T12:00:00Z');
beforeAll(async () => {
  const url = process.env.OVERVIEW_TEST_DATABASE_URL;
  if (!url || !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
    throw Error('Isolated monitor database required.');
  ledger = new LedgerService(url);
  auth = new AuthService({ databaseUrl: url, mode: 'local' });
  const engine = new BidService(ledger, {
    enabled: false,
    prefix: 'test:live-audit:' + randomUUID() + ':',
  });
  const staff = new StaffAdminService(ledger, auth, {
    fenceEligibility: async () => {},
  });
  monitor = new LiveMonitorService(staff, engine);
  const tag = randomUUID().slice(0, 8);
  categoryId = (
    await ledger.db.category.create({
      data: { name: 'Monitor test category', slug: 'monitor-' + tag },
    })
  ).id;
  locationId = (
    await ledger.db.location.create({
      data: {
        name: 'Monitor test centre',
        code: 'MON-' + tag,
        address: 'Synthetic test address',
        hours: {},
        capacityPerSlot: 10,
      },
    })
  ).id;
});
afterAll(async () => {
  await monitor?.onModuleDestroy();
  await auth?.close();
  await ledger?.close();
});
async function identity(role: string): Promise<AuthIdentity> {
  const email = 'monitor-' + randomUUID() + '@example.test';
  const user = await ledger.db.user.create({
    data: {
      name: 'Synthetic monitor staff',
      role,
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
      emailVerifiedAt: new Date(),
      staffCredential: {
        create: { passwordHash: 'synthetic-not-a-login-hash' },
      },
    },
  });
  const session = await ledger.db.authSession.create({
    data: {
      userId: user.id,
      client: 'web',
      staffAuthenticated: true,
      familyId: randomUUID(),
      deviceHash: '0'.repeat(64),
      accessHash: hashPii(randomUUID(), 'access'),
      refreshHash: hashPii(randomUUID(), 'refresh'),
      accessExpiresAt: new Date(Date.now() + 900000),
      expiresAt: new Date(Date.now() + 900000),
    },
  });
  return {
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
}
function create(status: string, hours: number) {
  return ledger.db.lot.create({
    data: {
      title: 'Original duration test',
      description: 'Synthetic isolated record.',
      condition: 'new',
      retailPriceKobo: 100000n,
      startPriceKobo: 50000n,
      categoryId,
      locationId,
      startAt,
      endAt: new Date(startAt.getTime() + hours * 3600000),
      status,
    },
  });
}
it('snapshots duration on first publication and preserves it after deadline extensions', async () => {
  const draft = await create('draft', 24);
  expect(draft.originalRunTimeMs).toBeNull();
  const published = await ledger.db.lot.update({
    where: { id: draft.id },
    data: { status: 'scheduled' },
  });
  expect(published.originalRunTimeMs).toBe(86400000n);
  const extended = await ledger.db.lot.update({
    where: { id: draft.id },
    data: {
      endAt: new Date(published.endAt.getTime() + 120000),
      status: 'open',
    },
  });
  expect(extended.originalRunTimeMs).toBe(86400000n);
  await expect(
    ledger.db.lot.update({
      where: { id: draft.id },
      data: { originalRunTimeMs: 7200000n },
    }),
  ).rejects.toThrow();
});
it('captures directly published seed/relisted lots without reconstructing historical duration', async () => {
  const open = await create('open', 48);
  expect(open.originalRunTimeMs).toBe(172800000n);
  const historical = await create('closed', 72);
  expect(historical.originalRunTimeMs).toBeNull();
  const changed = await ledger.db.lot.update({
    where: { id: historical.id },
    data: { endAt: new Date(historical.endAt.getTime() + 120000) },
  });
  expect(changed.originalRunTimeMs).toBeNull();
});
it('audits a reasoned history action exactly once across concurrent retries', async () => {
  const who = await identity('admin'),
    lot = await create('open', 24),
    idempotencyKey = randomUUID();
  const input = {
    idempotencyKey,
    operation: 'history',
    reason: 'Investigating a buyer bid query',
    lotId: lot.id,
  };
  await Promise.all([
    monitor.recordHistory(who, input),
    monitor.recordHistory(who, input),
  ]);
  const where = {
    actorId: who.user.id,
    entityId: lot.id,
    action: 'staff.live_history_opened',
  };
  expect(await ledger.db.auditLog.count({ where })).toBe(1);
  const audit = await ledger.db.auditLog.findFirstOrThrow({ where });
  if (!audit.afterCiphertext) throw Error('Audit snapshot unavailable.');
  expect(
    JSON.parse(decryptPii(Buffer.from(audit.afterCiphertext), 'audit')).input
      .reason,
  ).toBe(input.reason);
  await expect(
    monitor.recordHistory(who, {
      ...input,
      reason: 'Different request with reused key',
    }),
  ).rejects.toThrow();
});
it('rejects staff without bid-history permission and missing reasons before writing an audit event', async () => {
  const who = await identity('manager'),
    lot = await create('open', 24);
  await expect(
    monitor.recordHistory(who, {
      idempotencyKey: randomUUID(),
      operation: 'history',
      reason: 'Investigating a buyer query',
      lotId: lot.id,
    }),
  ).rejects.toThrow('permission');
  await expect(
    monitor.recordHistory(who, {
      idempotencyKey: randomUUID(),
      operation: 'history',
      reason: '',
      lotId: lot.id,
    }),
  ).rejects.toThrow();
  expect(
    await ledger.db.auditLog.count({
      where: { actorId: who.user.id, action: 'staff.live_history_opened' },
    }),
  ).toBe(0);
});
