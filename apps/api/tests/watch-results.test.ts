import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { LedgerService } from '../src/ledger/ledger-service';
import { BuyerService } from '../src/buyers/buyer-service';
import {
  enqueueBidderLosses,
  enqueueWatchResults,
} from '../src/closing/watch-results';
import { winnerEmail } from '../src/closing/winner-email';
import { emailImageUrl, firstName } from '../src/closing/result-mail-extras';
import { NotificationService } from '../src/closing/notification-service';
import { watchLostEmail } from '../src/closing/watch-lost-email';
import { outbidEmail } from '../src/closing/outbid-email';
import { encryptPii, hashPii } from '../src/security/pii';

let ledger: LedgerService;
let buyers: BuyerService;
let categoryId: string;
let locationId: string;
let loser: string;
let winner: string;
beforeAll(async () => {
  const url = process.env.WATCH_RESULTS_TEST_DATABASE_URL;
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
      data: {
        name: `Watch fixtures ${randomUUID().slice(0, 8)}`,
        slug: randomUUID(),
      },
    })
  ).id;
  locationId = (
    await ledger.db.location.create({
      data: {
        name: `Ikeja fixture ${randomUUID().slice(0, 8)}`,
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
      feeVersion: (await ledger.db.auctionFeePolicy.findFirstOrThrow()).version,
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
it('shows owned outbid alerts and retries failed mail with a stable delivery key', async () => {
  const item = await lot();
  const message = {
    title: 'Synthetic headphones',
    lotNumber: item.lotNumber,
    finalPriceKobo: 60000,
    itemUrl: `http://localhost:3300/lots/${item.id}`,
  };
  const notice = await ledger.db.notification.create({
    data: {
      userId: loser,
      reference: `outbid:${randomUUID()}:${loser}:${item.id}`,
      channel: 'email',
      template: 'outbid-v1',
      payloadCiphertext: encryptPii(
        JSON.stringify({
          emailCiphertext: Buffer.from(
            encryptPii('watcher@example.test', 'email'),
          ).toString('base64'),
          message,
        }),
        'notification',
      ),
    },
  });
  const entry = (await buyers.notifications(loser, 10)).items.find(
    (row) => row.id === notice.id,
  );
  expect(entry).toMatchObject({
    href: `/lots/${item.id}`,
    title: 'You were outbid. View item to bid again',
    readAt: null,
  });
  expect(
    (await buyers.notifications(winner, 10)).items.some(
      (row) => row.id === notice.id,
    ),
  ).toBe(false);
  const keys: (string | undefined)[] = [];
  const service = new NotificationService(ledger, {
    async send(_to, mail, key) {
      keys.push(key);
      expect(mail.Subject).toContain('You were outbid');
      expect(mail.HTML).toContain('View item and bid again');
      expect(mail.Text).not.toContain('Lost tab');
      if (keys.length === 1) throw Error('Simulated delivery outage');
    },
  });
  await expect(service.deliver()).rejects.toThrow('Simulated delivery outage');
  expect(
    (
      await ledger.db.notification.findUniqueOrThrow({
        where: { id: notice.id },
      })
    ).status,
  ).toBe('pending');
  await Promise.all([service.deliver(), service.deliver()]);
  expect(keys).toEqual([
    `auction-ng/notification/${notice.id}`,
    `auction-ng/notification/${notice.id}`,
  ]);
  expect(
    (
      await ledger.db.notification.findUniqueOrThrow({
        where: { id: notice.id },
      })
    ).status,
  ).toBe('sent');
  expect(
    outbidEmail({ ...message, title: '<script>bad</script>' }).HTML,
  ).toContain('&lt;script&gt;');
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

async function buyer(name: string) {
  const email = `${randomUUID()}@example.test`;
  return (
    await ledger.db.user.create({
      data: {
        name,
        emailCiphertext: encryptPii(email, 'email'),
        emailHash: hashPii(email, 'email'),
      },
    })
  ).id;
}
async function bid(lotId: string, userId: string, amountKobo: bigint) {
  await ledger.db.bid.create({
    data: {
      lotId,
      userId,
      amountKobo,
      maxKobo: amountKobo,
      idempotencyKey: randomUUID(),
    },
  });
}
it('emails every losing bidder once, saved or not, never the winner, with name and photo', async () => {
  const item = await lot();
  const tunde = await buyer('Tunde Bakare');
  const ada = await buyer('Ada');
  await bid(item.id, tunde, 40000n);
  await bid(item.id, tunde, 45000n);
  await bid(item.id, ada, 47000n);
  await bid(item.id, winner, 50000n);
  // Ada also saved it: she gets the bidder notice, not a second watch notice.
  await buyers.watch(ada, item.id, true);
  await ledger.db.lotImage.create({
    data: { lotId: item.id, sortOrder: 0, url: '/demo/headphones.jpg' },
  });
  await invoice(item.id);
  await ledger.db.lot.update({
    where: { id: item.id },
    data: { status: 'closed' },
  });
  await Promise.all([
    enqueueBidderLosses(ledger.db),
    enqueueBidderLosses(ledger.db),
    enqueueWatchResults(ledger.db),
  ]);
  await enqueueBidderLosses(ledger.db);
  const notices = await ledger.db.notification.findMany({
    where: { reference: { contains: item.id } },
    select: { reference: true, userId: true },
  });
  expect(notices.map((n) => n.reference).sort()).toEqual(
    [`bid-lost:${item.id}:${ada}`, `bid-lost:${item.id}:${tunde}`].sort(),
  );
  expect(
    (await ledger.db.lot.findUniqueOrThrow({ where: { id: item.id } }))
      .losersNotifiedAt,
  ).not.toBeNull();
  const entry = (await buyers.notifications(tunde, 10)).items.find(
    (row) => row.href === `/lots/${item.id}`,
  );
  expect(entry?.title).toBe('Another buyer won an item you bid on');
  const sent = new Map<string, { HTML: string; Text: string }>();
  const service = new NotificationService(ledger, {
    async send(to, mail) {
      sent.set(to, mail);
    },
  });
  // Earlier tests leave older queued mail; set it aside so one delivery
  // (20 at a time) reaches these notices.
  await ledger.db.notification.updateMany({
    where: { status: 'pending', NOT: { reference: { contains: item.id } } },
    data: { status: 'failed' },
  });
  await service.deliver();
  const mails = [...sent.values()].filter((m) =>
    m.Text.includes(item.lotNumber),
  );
  expect(mails).toHaveLength(2);
  const tundeMail = mails.find((m) => m.Text.includes('Sorry, Tunde.'));
  expect(tundeMail?.HTML).toContain(
    'src="http://localhost:3300/demo/headphones.jpg"',
  );
  expect(tundeMail?.Text).toContain('you bid on this item');
  expect(tundeMail?.Text).toContain('money reserved for your bid');
  expect(tundeMail?.Text).not.toContain('Lost tab');
  expect(mails.some((m) => m.Text.includes('Sorry, Ada.'))).toBe(true);
}, 60000);
it('marks lots with no paid sale done without emailing bidders', async () => {
  const item = await lot();
  const bidder = await buyer('Chidi');
  await bid(item.id, bidder, 40000n);
  await invoice(item.id, 'pending');
  await ledger.db.lot.update({
    where: { id: item.id },
    data: { status: 'closed' },
  });
  await enqueueBidderLosses(ledger.db);
  expect(
    await ledger.db.notification.count({
      where: { reference: `bid-lost:${item.id}:${bidder}` },
    }),
  ).toBe(0);
  // Still waiting: the sale is not paid yet, so it is checked again later.
  expect(
    (await ledger.db.lot.findUniqueOrThrow({ where: { id: item.id } }))
      .losersNotifiedAt,
  ).toBeNull();
});
it('words result emails by name and photo, and leaves the photo out safely', () => {
  const base = {
    title: 'Synthetic headphones',
    lotNumber: 'LOT-TEST1234',
    finalPriceKobo: 50000,
    itemUrl: 'https://giddydeal.ng/lots/test',
  };
  const bought = watchLostEmail(
    { ...base, reason: 'bid', outcome: 'bought' },
    { firstName: 'Tunde' },
  );
  expect(bought.HTML).toContain('Another buyer bought this item');
  expect(bought.HTML).not.toContain('item-image');
  expect(bought.HTML).not.toContain('{{');
  const watched = watchLostEmail(base);
  expect(watched.Text).toContain('Sorry. The deal has ended');
  expect(watched.Text).toContain('Lost tab');
  const hostile = watchLostEmail(base, {
    imageUrl: 'https://img.example/a.webp?x="><script>',
  });
  expect(hostile.HTML).not.toContain('"><script>');
  expect(() =>
    watchLostEmail(base, { imageUrl: 'javascript:alert(1)' }),
  ).toThrow();
  const won = winnerEmail(
    {
      invoiceNumber: 'INV-1',
      title: base.title,
      lotNumber: base.lotNumber,
      hammerKobo: 50000,
      premiumKobo: 7500,
      lotFeeKobo: 30000,
      vatKobo: 2813,
      totalKobo: 90313,
      location: 'Ikeja',
      address: 'Synthetic',
      status: 'paid',
      deadline: null,
    },
    { firstName: 'Tunde', imageUrl: 'https://img.example/a.webp' },
  );
  expect(won.HTML).toContain('Congratulations, Tunde!');
  expect(won.HTML).toContain('src="https://img.example/a.webp"');
  expect(firstName('  tunde bakare')).toBe('tunde');
  expect(firstName('user@example.test')).toBeUndefined();
  expect(firstName('')).toBeUndefined();
  expect(emailImageUrl('/placeholders/photo-pending.svg')).toBeUndefined();
  expect(emailImageUrl('ftp://x/y.jpg')).toBeUndefined();
  expect(emailImageUrl('https://cdn.example/x.webp')).toBe(
    'https://cdn.example/x.webp',
  );
});
