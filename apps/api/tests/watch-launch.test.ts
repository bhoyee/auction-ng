import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { LedgerService } from '../src/ledger/ledger-service';
import { BuyerService } from '../src/buyers/buyer-service';
import { enqueueWatchLaunches } from '../src/closing/watch-launches';
import { watchLaunchEmail } from '../src/closing/watch-launch-email';
import { NativePushService } from '../src/native-push/native-push-service';
import { NotificationService } from '../src/closing/notification-service';
import { encryptPii, hashPii } from '../src/security/pii';
import type { AuthIdentity } from '../src/auth/auth-service';
let ledger: LedgerService,
  buyers: BuyerService,
  categoryId: string,
  locationId: string;
beforeAll(async () => {
  vi.stubEnv('EXPO_PUSH_ENABLED', 'false');
  const url =
    process.env.WATCH_LAUNCH_TEST_DATABASE_URL ??
    process.env.AUTH_TEST_DATABASE_URL;
  if (!url || !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
    throw Error('Isolated database required');
  ledger = new LedgerService(url);
  buyers = new BuyerService(url);
  categoryId = (
    await ledger.db.category.create({
      data: { name: 'Launch fixtures', slug: randomUUID() },
    })
  ).id;
  locationId = (
    await ledger.db.location.create({
      data: {
        code: randomUUID().slice(0, 30),
        name: 'Lagos fixture',
        address: 'Synthetic address',
        hours: {},
        capacityPerSlot: 10,
      },
    })
  ).id;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await buyers?.onModuleDestroy();
  await ledger?.close();
});
async function fixture(minutes = 5, status = 'scheduled') {
  const email = randomUUID() + '@example.test';
  const user = await ledger.db.user.create({
    data: {
      name: 'Synthetic watcher',
      emailVerifiedAt: new Date(),
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
    },
  });
  const lot = await ledger.db.lot.create({
    data: {
      title: 'Demo headphones',
      description: 'Fixture',
      condition: 'new',
      categoryId,
      locationId,
      retailPriceKobo: 500000n,
      startPriceKobo: 50000n,
      status,
      scheduleVersion: 1,
      startAt: new Date(Date.now() + minutes * 60000),
      endAt: new Date(Date.now() + 3600000),
    },
  });
  await ledger.db.watchlist.create({
    data: {
      userId: user.id,
      lotId: lot.id,
      createdAt: new Date(Date.now() - 3600000),
    },
  });
  return { user, lot };
}
it('queues one reminder and one live alert despite concurrent retries; inbox counts and read work', async () => {
  const { user, lot } = await fixture();
  await Promise.all([
    enqueueWatchLaunches(ledger.db),
    enqueueWatchLaunches(ledger.db),
  ]);
  expect(
    await ledger.db.notification.count({ where: { userId: user.id } }),
  ).toBe(1);
  await ledger.db.lot.update({
    where: { id: lot.id },
    data: { status: 'open', startAt: new Date(Date.now() - 1000) },
  });
  await Promise.all([
    enqueueWatchLaunches(ledger.db),
    enqueueWatchLaunches(ledger.db),
  ]);
  const page = await buyers.notifications(user.id, 10);
  expect(page.items).toHaveLength(2);
  expect(page.items.some((v) => v.title.includes('live'))).toBe(true);
  expect(page.items.every((v) => v.href === '/lots/' + lot.id)).toBe(true);
  expect((await buyers.notificationSummary(user.id)).unread).toBe(2);
  await buyers.readNotifications(
    user.id,
    page.items.map((v) => v.id),
  );
  expect((await buyers.notificationSummary(user.id)).unread).toBe(0);
});
it('does not alert unwatched, cancelled, archived, ended or still-launching items', async () => {
  const samples = await Promise.all([
    fixture(),
    fixture(),
    fixture(),
    fixture(-1, 'open'),
    fixture(-1, 'scheduled'),
  ]);
  const [a, b, c, d, e] = samples;
  if (!a || !b || !c || !d || !e) throw Error('Fixture missing');
  await ledger.db.watchlist.delete({
    where: { userId_lotId: { userId: a.user.id, lotId: a.lot.id } },
  });
  await ledger.db.lot.update({
    where: { id: b.lot.id },
    data: { status: 'cancelled' },
  });
  await ledger.db.lot.update({
    where: { id: c.lot.id },
    data: { archivedAt: new Date(), status: 'cancelled' },
  });
  await ledger.db.lot.update({
    where: { id: d.lot.id },
    data: { endAt: new Date(Date.now() - 1000) },
  });
  await ledger.db.lot.update({
    where: { id: e.lot.id },
    data: { preBidsLaunching: true },
  });
  await enqueueWatchLaunches(ledger.db);
  expect(
    await ledger.db.notification.count({
      where: { userId: { in: samples.map((v) => v.user.id) } },
    }),
  ).toBe(0);
});
it('uses the new schedule after rescheduling and does not replay after unwatch/re-watch', async () => {
  const { user, lot } = await fixture();
  await enqueueWatchLaunches(ledger.db);
  await ledger.db.lot.update({
    where: { id: lot.id },
    data: { scheduleVersion: 2, startAt: new Date(Date.now() + 4 * 60000) },
  });
  await enqueueWatchLaunches(ledger.db);
  await ledger.db.watchlist.delete({
    where: { userId_lotId: { userId: user.id, lotId: lot.id } },
  });
  await ledger.db.watchlist.create({
    data: { userId: user.id, lotId: lot.id },
  });
  await enqueueWatchLaunches(ledger.db);
  expect(
    await ledger.db.notification.count({ where: { userId: user.id } }),
  ).toBe(2);
});
it('delivers explicit phone text and a branded email preview, without changing a wallet', async () => {
  const { user, lot } = await fixture();
  const session = await ledger.db.authSession.create({
    data: {
      userId: user.id,
      familyId: randomUUID(),
      deviceHash: '0'.repeat(64),
      client: 'mobile',
      buyerMfa: true,
      accessHash: randomUUID().padEnd(64, '0'),
      refreshHash: randomUUID().padEnd(64, '0'),
      accessExpiresAt: new Date(Date.now() + 900000),
      expiresAt: new Date(Date.now() + 900000),
    },
  });
  const sender = vi.fn(async () => ({
    status: 'ok' as const,
    id: randomUUID(),
  }));
  const push = new NativePushService(ledger, sender);
  await push.register(
    { user: { id: user.id }, sessionId: session.id } as AuthIdentity,
    { token: 'ExponentPushToken[' + randomUUID() + ']', platform: 'android' },
  );
  await enqueueWatchLaunches(ledger.db);
  await push.deliver();
  expect(sender).toHaveBeenCalledWith(
    expect.objectContaining({ body: expect.stringContaining('starts soon') }),
  );
  const mail = { send: vi.fn(async () => {}) };
  await new NotificationService(ledger, mail).deliver();
  expect(mail.send).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      Subject: expect.stringContaining('starts soon'),
    }),
    expect.any(String),
  );
  expect(await ledger.db.wallet.count({ where: { userId: user.id } })).toBe(0);
  await ledger.db.lot.update({
    where: { id: lot.id },
    data: { status: 'open', startAt: new Date(Date.now() - 1000) },
  });
  await enqueueWatchLaunches(ledger.db);
  await push.deliver();
  expect(sender).toHaveBeenLastCalledWith(
    expect.objectContaining({ body: expect.stringContaining('is live') }),
  );
});
it('escapes item text and rejects untrusted links', () => {
  const input = {
    phase: 'live' as const,
    title: '<script>bad</script>',
    lotNumber: 'DEMO1234',
    itemUrl: 'https://lotvanta.com/lots/' + randomUUID(),
    startsAt: new Date().toISOString(),
  };
  const result = watchLaunchEmail(input);
  expect(result.HTML).not.toContain('<script>');
  expect(result.HTML).toContain('&lt;script&gt;');
  expect(() =>
    watchLaunchEmail({ ...input, itemUrl: 'javascript:alert(1)' }),
  ).toThrow();
});

it('suppresses queued alerts after unwatch or rescheduling and waits until the reminder window', async () => {
  const distant = await fixture(30);
  await enqueueWatchLaunches(ledger.db);
  expect(
    await ledger.db.notification.count({ where: { userId: distant.user.id } }),
  ).toBe(0);
  const a = await fixture(),
    b = await fixture();
  await enqueueWatchLaunches(ledger.db);
  await ledger.db.watchlist.delete({
    where: { userId_lotId: { userId: a.user.id, lotId: a.lot.id } },
  });
  await ledger.db.lot.update({
    where: { id: b.lot.id },
    data: {
      scheduleVersion: 2,
      startAt: new Date(Date.now() + 3600000),
      endAt: new Date(Date.now() + 7200000),
    },
  });
  const mail = { send: vi.fn(async () => {}) };
  await new NotificationService(ledger, mail).deliver();
  const rows = await ledger.db.notification.findMany({
    where: { userId: { in: [a.user.id, b.user.id] } },
  });
  expect(rows).toHaveLength(2);
  expect(rows.every((v) => v.status === 'failed')).toBe(true);
});
