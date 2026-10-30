import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { LedgerService } from '../src/ledger/ledger-service';
import { BuyerService } from '../src/buyers/buyer-service';
import { enqueueWatchResults } from '../src/closing/watch-results';
import { NotificationService } from '../src/closing/notification-service';
import { watchLostEmail } from '../src/closing/watch-lost-email';
import { encryptPii, hashPii } from '../src/security/pii';

let ledger: LedgerService;
let buyers: BuyerService;
let categoryId: string;
let locationId: string;
let loser: string;
let winner: string;
beforeAll(async () => {
  const url = process.env.BUYER_TEST_DATABASE_URL;
  if (
    !url ||
    process.env.NODE_ENV !== 'test' ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname)
  )
    throw Error('Isolated test database required');
  ledger = new LedgerService(url);
  buyers = new BuyerService(url);
  categoryId = (
    await ledger.db.category.create({
      data: { name: 'Watch fixtures', slug: randomUUID() },
    })
  ).id;
  locationId = (
    await ledger.db.location.create({
      data: {
        name: 'Ikeja fixture',
        code: randomUUID().slice(0, 30),
        address: 'Synthetic test address',
        hours: {},
        capacityPerSlot: 20,
      },
    })
  ).id;
  loser = (
    await ledger.db.user.create({
      data: {
        name: 'Watcher',
        emailCiphertext: encryptPii('watcher@example.test', 'email'),
        emailHash: hashPii('watcher@example.test', 'email'),
      },
    })
  ).id;
  winner = (
    await ledger.db.user.create({
      data: {
        name: 'Winner',
        emailCiphertext: encryptPii('winner@example.test', 'email'),
        emailHash: hashPii('winner@example.test', 'email'),
      },
    })
  ).id;
});
afterAll(async () => {
  await ledger?.db.$disconnect();
  await buyers?.db.$disconnect();
});
async function lot() {
  return ledger.db.lot.create({
    data: {
      title: 'Synthetic headphones',
      description: 'Test fixture',
      condition: 'open_box',
      retailPriceKobo: 900000n,
      startPriceKobo: 50000n,
      startAt: new Date(Date.now() - 3600000),
      endAt: new Date(Date.now() + 3600000),
      categoryId,
      locationId,
      status: 'open',
    },
  });
}
async function invoice(lotId: string, status = 'paid') {
  return ledger.db.invoice.create({
    data: {
      userId: winner,
      status,
      hammerTotalKobo: 50000n,
      premiumKobo: 0n,
      lotFeeKobo: 0n,
      vatKobo: 0n,
      totalKobo: 50000n,
      lines: {
        create: {
          lotId,
          hammerKobo: 50000n,
          premiumKobo: 0n,
          lotFeeKobo: 0n,
          vatKobo: 0n,
          totalKobo: 50000n,
        },
      },
    },
  });
}
it('concurrent scans queue one owned alert, reduce active count, and retain Lost history without moving money', async () => {
  const item = await lot();
  await buyers.watch(loser, item.id, true);
  await buyers.watch(winner, item.id, true);
  const before = (await buyers.watchCount(loser)).count;
  const entries = await ledger.db.ledgerEntry.count();
  await invoice(item.id);
  await ledger.db.lot.update({
    where: { id: item.id },
    data: { status: 'closed' },
  });
  await Promise.all([
    enqueueWatchResults(ledger.db),
    enqueueWatchResults(ledger.db),
  ]);
  await enqueueWatchResults(ledger.db);
  expect(
    await ledger.db.notification.count({
      where: { reference: `watch-lost:${item.id}:${loser}` },
    }),
  ).toBe(1);
  expect(
    await ledger.db.notification.count({
      where: { reference: `watch-lost:${item.id}:${winner}` },
    }),
  ).toBe(0);
  expect((await buyers.watchCount(loser)).count).toBe(before - 1);
  expect(
    (await buyers.watchActivity(loser, 'lost', 10)).items.some(
      (row) => row.id === item.id,
    ),
  ).toBe(true);
  expect(await ledger.db.watchlist.count({ where: { lotId: item.id } })).toBe(
    2,
  );
  expect(await ledger.db.ledgerEntry.count()).toBe(entries);
  const notice = (await buyers.notifications(loser, 10)).items.find(
    (row) => row.href === `/lots/${item.id}`,
  );
  expect(notice?.title).toBe('Another buyer won an item you watched');
  expect((await buyers.notificationSummary(loser)).unread).toBe(1);
  if (!notice) throw Error('Missing notice');
  expect(await buyers.readNotifications(winner, [notice.id])).toEqual({
    updated: 0,
  });
  expect(await buyers.readNotifications(loser, [notice.id])).toEqual({
    updated: 1,
  });
});
it('does not notify for open stock, unpaid results, unwatched buyers, or watches added after closing', async () => {
  const open = await lot();
  const pending = await lot();
  const late = await lot();
  await buyers.watch(loser, open.id, true);
  await buyers.watch(loser, pending.id, true);
  await invoice(pending.id, 'pending');
  await ledger.db.lot.update({
    where: { id: pending.id },
    data: { status: 'closed' },
  });
  await invoice(late.id);
  await ledger.db.lot.update({
    where: { id: late.id },
    data: { status: 'closed', endAt: new Date(Date.now() - 60000) },
  });
  await buyers.watch(loser, late.id, true);
  await enqueueWatchResults(ledger.db);
  expect(
    await ledger.db.notification.count({
      where: {
        reference: {
          in: [open, pending, late].map(
            (row) => `watch-lost:${row.id}:${loser}`,
          ),
        },
      },
    }),
  ).toBe(0);
});
it('delivers loss mail once across concurrent delivery attempts using a stable reference', async () => {
  const sent: string[] = [];
  const service = new NotificationService(ledger, {
    async send(to, message, key) {
      expect(to).toBe('watcher@example.test');
      expect(message.HTML).toContain('Another buyer won this item');
      expect(message.Text).toContain('Lost tab');
      expect(key).toMatch(/^auction-ng\/notification\//);
      sent.push(to);
    },
  });
  await Promise.all([service.deliver(), service.deliver()]);
  await service.deliver();
  expect(sent).toHaveLength(1);
});
it('escapes email content and rejects unsafe links, fractional money and subject injection', () => {
  const input = {
    title: '<img src=x onerror=alert(1)>',
    lotNumber: 'ABCDEFGH',
    finalPriceKobo: 50000,
    itemUrl: 'https://auctionng.com/lots/test',
  };
  const message = watchLostEmail(input);
  expect(message.HTML).toContain('&lt;img');
  expect(message.HTML).not.toContain('<img src=x');
  for (const value of [
    { ...input, itemUrl: 'javascript:alert(1)' },
    { ...input, finalPriceKobo: 1.5 },
    { ...input, lotNumber: 'A\r\nBcc: bad' },
  ])
    expect(() => watchLostEmail(value)).toThrow();
});
it('marks unsold watches handled without sending a loss alert', async () => {
  const item = await lot();
  await buyers.watch(loser, item.id, true);
  const namespace = `watch-test-${randomUUID()}`;
  await ledger.db.bidEngineRuntime.create({
    data: { namespace, redisRunId: randomUUID() },
  });
  await ledger.db.lotSettlement.create({
    data: {
      lotId: item.id,
      namespace,
      feeVersion: 'test',
      streamId: '1-0',
      barrierId: '1-0',
      endAt: new Date(Date.now() - 1000),
      closedAt: new Date(),
      snapshot: {},
      status: 'unsold',
    },
  });
  await ledger.db.lot.update({
    where: { id: item.id },
    data: { status: 'closed' },
  });
  await enqueueWatchResults(ledger.db);
  expect(
    await ledger.db.notification.count({
      where: { reference: `watch-lost:${item.id}:${loser}` },
    }),
  ).toBe(0);
  expect(
    (
      await ledger.db.watchlist.findUniqueOrThrow({
        where: { userId_lotId: { userId: loser, lotId: item.id } },
      })
    ).resultHandledAt,
  ).not.toBeNull();
});
it('processes at most fifty watches per scan and finishes the remainder on retry', async () => {
  const item = await lot();
  const users = Array.from({ length: 51 }, () => ({
    id: randomUUID(),
    name: 'Synthetic batch watcher',
    emailCiphertext: encryptPii(`${randomUUID()}@example.test`, 'email'),
  }));
  // A paired identity envelope is required even when no email will be delivered.
  await ledger.db.user.createMany({
    data: users.map((row) => ({
      ...row,
      emailHash: hashPii(row.id + '@example.test', 'email'),
    })),
  });
  await ledger.db.watchlist.createMany({
    data: users.map((row) => ({ userId: row.id, lotId: item.id })),
  });
  await invoice(item.id);
  await ledger.db.lot.update({
    where: { id: item.id },
    data: { status: 'closed' },
  });
  expect((await enqueueWatchResults(ledger.db)).processed).toBe(50);
  expect((await enqueueWatchResults(ledger.db)).processed).toBe(1);
  expect(
    await ledger.db.notification.count({
      where: { reference: { startsWith: `watch-lost:${item.id}:` } },
    }),
  ).toBe(51);
});
