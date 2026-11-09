import { createClient } from 'redis';
import { CLOSE_LUA } from '../src/closing/close-lua';
import { encryptPii, hashPii } from '../src/security/pii';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { PreBidService } from '../src/prebids/prebid-service';
import { randomUUID, randomBytes } from 'node:crypto';
import { createApi } from '../src/app';
import { createPreBidClient } from '../../../packages/api-client/src/prebids';
import { createBuyerClient } from '../../../packages/api-client/src/buyers';
import { BidService } from '../src/bids/bid-service';
import { ClosingService } from '../src/closing/closing-service';
import { CatalogueService } from '../src/catalogue/catalogue-service';
import { BuyerService } from '../src/buyers/buyer-service';
import { LedgerService } from '../src/ledger/ledger-service';
import {
  auctionFeeSettingsSchema,
  LEGACY_AUCTION_FEE_POLICY,
  type AuctionFeeUpdate,
} from '@auction-ng/shared';
import type { AuthIdentity } from '../src/auth/auth-service';
let ledger: LedgerService,
  bids: BidService,
  categoryId: string,
  locationId: string,
  admin: AuthIdentity;
beforeAll(async () => {
  const url = process.env.PREBID_TEST_DATABASE_URL;
  if (!url || !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
    throw Error('Isolated fee database required.');
  ledger = new LedgerService(url);
  bids = new BidService(ledger, {
    enabled: true,
    prefix: `test:fees:${randomUUID()}:`,
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  });
  await bids.start();
  categoryId = (
    await ledger.db.category.create({
      data: { name: 'Synthetic fees', slug: randomUUID() },
    })
  ).id;
  locationId = (
    await ledger.db.location.create({
      data: {
        code: randomUUID().slice(0, 30),
        name: 'Synthetic collection',
        address: 'Lagos test',
        hours: {},
        capacityPerSlot: 20,
      },
    })
  ).id;
  const email = 'admin-' + randomUUID() + '@example.test';
  const user = await ledger.db.user.create({
    data: {
      name: 'Synthetic admin',
      role: 'admin',
      authenticatorEnabled: true,
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
    },
  });
  const session = await ledger.db.authSession.create({
    data: {
      // Fixture: a completed password + email security check for bidding.
      bidVerifiedUntil: new Date(Date.now() + 30 * 60 * 1000),
      userId: user.id,
      staffMfa: true,
      authenticatorVersion: 0,
      familyId: randomUUID(),
      deviceHash: '0'.repeat(64),
      client: 'web',
      accessHash: randomUUID().padEnd(64, '0'),
      refreshHash: randomUUID().padEnd(64, '0'),
      accessExpiresAt: new Date(Date.now() + 900000),
      expiresAt: new Date(Date.now() + 900000),
    },
  });
  admin = {
    user: {
      id: user.id,
      name: user.name,
      role: 'admin',
      status: 'active',
      emailVerified: false,
      phoneVerified: false,
    },
    sessionId: session.id,
  } as AuthIdentity;
});
afterAll(async () => {
  await bids?.close();
  await ledger?.close();
});
async function lot() {
  return ledger.db.lot.create({
    data: {
      lotNumber: randomUUID(),
      title: 'Synthetic fee lot',
      description: 'Synthetic',
      condition: 'open_box',
      retailPriceKobo: 1000000n,
      startPriceKobo: 50000n,
      status: 'open',
      startAt: new Date(Date.now() - 1000),
      endAt: new Date(Date.now() + 180000),
      categoryId,
      locationId,
    },
  });
}
async function buyer() {
  const email = randomUUID() + '@example.test';
  const user = await ledger.db.user.create({
    data: {
      name: 'Synthetic buyer',
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
      emailVerifiedAt: new Date(),
    },
  });
  const wallet = await ledger.openWallet(user.id);
  await ledger.topup({
    walletId: wallet.id,
    amountKobo: 10000000n,
    idempotencyKey: randomUUID(),
    reference: randomUUID(),
  });
  const session = await ledger.db.authSession.create({
    data: {
      // Fixture: a completed password + email security check for bidding.
      bidVerifiedUntil: new Date(Date.now() + 30 * 60 * 1000),
      userId: user.id,
      buyerMfa: true,
      familyId: randomUUID(),
      deviceHash: '0'.repeat(64),
      client: 'web',
      accessHash: randomUUID().padEnd(64, '0'),
      refreshHash: randomUUID().padEnd(64, '0'),
      accessExpiresAt: new Date(Date.now() + 900000),
      expiresAt: new Date(Date.now() + 900000),
    },
  });
  return { userId: user.id, sessionId: session.id };
}
function config(revision: number): AuctionFeeUpdate {
  return {
    serviceChargeEnabled: true,
    premiumBps: 1000,
    lotFeeEnabled: false,
    lotFeeKobo: 30000,
    vatEnabled: true,
    vatBps: 750,
    expectedRevision: revision,
    idempotencyKey: randomUUID(),
    reason: 'Synthetic fee configuration',
  };
}

async function scheduled() {
  const row = await lot();
  await ledger.db.lotImage.create({
    data: {
      lotId: row.id,
      url: 'https://example.test/item.webp',
      thumbnailUrl: 'https://example.test/thumb.webp',
      width: 960,
      height: 960,
      thumbnailBytes: 1000,
      sortOrder: 0,
    },
  });
  return ledger.db.lot.update({
    where: { id: row.id },
    data: {
      status: 'scheduled',
      startAt: new Date(Date.now() + 3600000),
      endAt: new Date(Date.now() + 7200000),
    },
  });
}
const input = (revision = 0, maxKobo = 1000000) => ({
  maxKobo,
  feeVersion: 'auction-fees-v1',
  expectedRevision: revision,
  idempotencyKey: randomUUID(),
});
it('reserves, changes, retries and cancels pre-bids without duplicate money movements', async () => {
  const service = new PreBidService(ledger, bids),
    who = await buyer(),
    item = await scheduled();
  const request = input();
  const first = await service.change(who, item.id, request);
  expect(first.preBid?.revision).toBe(1);
  expect((await service.change(who, item.id, request)).preBid?.id).toBe(
    first.preBid?.id,
  );
  const changed = await service.change(who, item.id, input(1, 500000));
  expect(changed.preBid?.totalKobo).toBe(612875);
  await expect(service.change(who, item.id, input(1))).rejects.toThrow();
  const cancel = { expectedRevision: 2, idempotencyKey: randomUUID() };
  await service.cancel(who, item.id, cancel);
  await service.cancel(who, item.id, cancel);

  expect((await ledger.getWallet(who.userId)).availableKobo).toBe(10000000);
  expect((await ledger.getWallet(who.userId)).heldKobo).toBe(0);
});
it('admin rescheduling cancels reservations and notifies buyers', async () => {
  const service = new PreBidService(ledger, bids),
    item = await scheduled();
  const one = await buyer(),
    two = await buyer();
  await service.change(one, item.id, input());
  await service.change(two, item.id, input());
  const current = await ledger.db.lot.findUniqueOrThrow({
    where: { id: item.id },
  });
  const command = {
    action: 'schedule' as const,
    startsAt: new Date(Date.now() + 7200000).toISOString(),
    endsAt: new Date(Date.now() + 10800000).toISOString(),
    expectedUpdatedAt: current.updatedAt.toISOString(),
    idempotencyKey: randomUUID(),
    reason: 'Move launch to later today',
  };
  await service.schedule(admin, item.id, command);
  await service.schedule(admin, item.id, command);
  expect(
    await ledger.db.preBid.count({
      where: { lotId: item.id, status: 'cancelled' },
    }),
  ).toBe(2);
  expect(
    await ledger.db.notification.count({
      where: {
        template: 'prebid-v1',
        userId: { in: [one.userId, two.userId] },
      },
    }),
  ).toBe(2);
  for (const who of [one, two]) {
    expect((await ledger.getWallet(who.userId)).heldKobo).toBe(0);
  }
});
it('launches equal automatic limits in priority order and recovers a lost activation reply', async () => {
  const service = new PreBidService(ledger, bids),
    item = await scheduled(),
    one = await buyer(),
    two = await buyer();
  await service.change(one, item.id, input());
  await service.change(two, item.id, input());
  await ledger.db.lot.update({
    where: { id: item.id },
    data: { startAt: new Date(Date.now() - 1000) },
  });
  let fail = true;
  service.afterActivation = async () => {
    if (fail) {
      fail = false;
      throw Error('Synthetic lost response');
    }
  };
  await expect(service.maintain()).rejects.toThrow('Synthetic lost response');
  await service.maintain();
  await service.maintain();
  expect(
    (await ledger.db.lot.findUniqueOrThrow({ where: { id: item.id } })).status,
  ).toBe('open');
  const live = await bids.publicBrowseStates([item.id]);
  expect(live.states[0]?.open).toBe(true);
  const redis = createClient({
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  });
  await redis.connect();
  const state = JSON.parse(
    String(await redis.get(bids.prefix + 'lot:' + item.id)),
  );
  expect(state.leader.bidderId).toBe(one.userId);
  expect(state.feeVersion).toBe('auction-fees-v1');
  expect(
    await ledger.db.bidFundingIntent.count({ where: { lotId: item.id } }),
  ).toBe(2);
  await expect(
    service.cancel(one, item.id, {
      expectedRevision: 1,
      idempotencyKey: randomUUID(),
    }),
  ).rejects.toThrow();
  await redis.quit();
});
it('keeps the old reservation when an increased limit cannot be funded, and rejects another buyer cancellation', async () => {
  const service = new PreBidService(ledger, bids),
    item = await scheduled(),
    who = await buyer(),
    other = await buyer();
  await service.change(who, item.id, input());
  await expect(
    service.change(who, item.id, input(1, 20000000)),
  ).rejects.toThrow();
  expect((await service.read(who, item.id)).preBid?.revision).toBe(1);
  expect((await ledger.getWallet(who.userId)).heldKobo).toBe(1193500);
  await expect(
    service.cancel(other, item.id, {
      expectedRevision: 1,
      idempotencyKey: randomUUID(),
    }),
  ).rejects.toThrow();
  expect((await service.read(other, item.id)).preBid).toBeNull();
  expect((await ledger.getWallet(who.userId)).heldKobo).toBe(1193500);
});
it('serializes simultaneous reservations against one available wallet balance', async () => {
  const service = new PreBidService(ledger, bids),
    one = await scheduled(),
    two = await scheduled(),
    who = await buyer();
  const outcomes = await Promise.allSettled([
    service.change(who, one.id, input(0, 6000000)),
    service.change(who, two.id, input(0, 6000000)),
  ]);
  expect(
    outcomes.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1);
  const balance = await ledger.getWallet(who.userId);
  expect(balance.availableKobo).toBeGreaterThanOrEqual(0);
  expect(balance.totalKobo).toBe(10000000);
  expect(balance.heldKobo).toBe(6999750);
});
it('admin cancellation racing an edit releases the final reservation exactly once', async () => {
  const service = new PreBidService(ledger, bids),
    item = await scheduled(),
    who = await buyer();
  await service.change(who, item.id, input());
  const row = await ledger.db.lot.findUniqueOrThrow({ where: { id: item.id } });
  const action = {
    action: 'cancel' as const,
    expectedUpdatedAt: row.updatedAt.toISOString(),
    idempotencyKey: randomUUID(),
    reason: 'Cancel upcoming stock',
  };
  await Promise.allSettled([
    service.change(who, item.id, input(1, 600000)),
    service.schedule(admin, item.id, action),
  ]);
  await service.schedule(admin, item.id, action);
  await service.maintain();
  expect(
    (await ledger.db.lot.findUniqueOrThrow({ where: { id: item.id } })).status,
  ).toBe('cancelled');
  expect((await ledger.getWallet(who.userId)).heldKobo).toBe(0);
  expect((await ledger.getWallet(who.userId)).availableKobo).toBe(10000000);
  expect(
    await ledger.db.notification.count({
      where: { userId: who.userId, template: 'prebid-v1' },
    }),
  ).toBe(1);
});
it('admin cancellation racing launch cannot release a consumed winning hold', async () => {
  const service = new PreBidService(ledger, bids),
    item = await scheduled(),
    who = await buyer();
  await service.change(who, item.id, input());
  const row = await ledger.db.lot.update({
    where: { id: item.id },
    data: { startAt: new Date(Date.now() - 1000) },
  });
  await Promise.allSettled([
    service.maintain(),
    service.schedule(admin, item.id, {
      action: 'cancel',
      expectedUpdatedAt: row.updatedAt.toISOString(),
      idempotencyKey: randomUUID(),
      reason: 'Cancel at launch boundary',
    }),
  ]);
  await service.maintain();
  const lot = await ledger.db.lot.findUniqueOrThrow({ where: { id: item.id } }),
    wallet = await ledger.getWallet(who.userId);
  if (lot.status === 'cancelled') {
    expect(wallet.heldKobo).toBe(0);
    expect(await ledger.db.bid.count({ where: { lotId: item.id } })).toBe(0);
  } else {
    expect(lot.status).toBe('open');
    expect(wallet.heldKobo).toBe(1193500);
    expect(
      await ledger.db.bid.count({ where: { lotId: item.id, role: 'request' } }),
    ).toBe(1);
  }
});
it('excludes upcoming stock from live catalogue and search matches, without exposing private limits', async () => {
  const item = await scheduled(),
    who = await buyer(),
    service = new PreBidService(ledger, bids);
  await service.change(who, item.id, input());
  const catalogue = new CatalogueService(process.env.PREBID_TEST_DATABASE_URL);
  try {
    const upcoming = await catalogue.upcoming({ limit: 50 });
    const shown = upcoming.items.find((row) => row.id === item.id);
    expect((await catalogue.result(item.id)).state).toBe('scheduled');
    expect(shown).toBeDefined();
    expect(JSON.stringify(shown)).not.toMatch(
      /maxKobo|totalKobo|userId|sessionId|holdId/,
    );
    expect(
      (await catalogue.list({ limit: 50 })).items.some(
        (row) => row.id === item.id,
      ),
    ).toBe(false);
    expect(
      await catalogue.searchMatches([item.id], { limit: 50 }, new Date()),
    ).toEqual([]);
  } finally {
    await catalogue.db.$disconnect();
  }
});
it('keeps a launch gated across the 50-item batch boundary and releases losing reservations', async () => {
  const service = new PreBidService(ledger, bids),
    item = await scheduled(),
    people = [];
  for (let i = 0; i < 51; i++) {
    const who = await buyer();
    people.push(who);
    await service.change(who, item.id, input());
  }
  await ledger.db.lot.update({
    where: { id: item.id },
    data: { startAt: new Date(Date.now() - 1000) },
  });
  await service.maintain();
  expect(
    (await ledger.db.lot.findUniqueOrThrow({ where: { id: item.id } })).status,
  ).toBe('scheduled');
  expect(
    await ledger.db.preBid.count({
      where: { lotId: item.id, status: 'active' },
    }),
  ).toBe(1);
  const last = people.at(-1);
  if (!last) throw Error('Missing synthetic bidder');
  await expect(
    bids.prepare(
      last,
      item.id,
      { maxKobo: 2000000, mode: 'direct', idempotencyKey: randomUUID() },
      randomUUID(),
      randomUUID(),
    ),
  ).rejects.toThrow('not open');
  await service.maintain();
  await service.maintain();
  expect(
    (await ledger.db.lot.findUniqueOrThrow({ where: { id: item.id } })).status,
  ).toBe('open');
  expect(
    await ledger.db.bidFundingIntent.count({ where: { lotId: item.id } }),
  ).toBe(51);
  for (let i = 0; i < people.length; i++) {
    const person = people[i];
    if (!person) throw Error('Missing bidder');
    expect((await ledger.getWallet(person.userId)).heldKobo).toBe(
      i === 0 ? 1193500 : 0,
    );
  }
}, 120000);
it('uses protected typed endpoints and rejects unknown input fields without reserving funds', async () => {
  const who = await buyer(),
    item = await scheduled(),
    token = randomBytes(32).toString('base64url'),
    deviceId = randomUUID();
  await ledger.db.authSession.update({
    where: { id: who.sessionId },
    data: {
      accessHash: hashPii(token, 'auth-token'),
      deviceHash: hashPii('web:' + deviceId, 'auth-device'),
    },
  });
  const app = await createApi({
    databaseUrl: process.env.PREBID_TEST_DATABASE_URL,
    mode: 'local',
    emailProvider: { sendCode: async () => {} },
    bidOptions: { enabled: true, prefix: bids.prefix },
  });
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl(),
      client = createPreBidClient(base, { accessToken: token, deviceId });
    expect((await fetch(base + '/lots/' + item.id + '/prebid')).status).toBe(
      401,
    );
    expect((await fetch(base + '/upcoming-lots?limit=1')).status).toBe(200);
    const wrong = await fetch(base + '/lots/' + item.id + '/prebid', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'X-Device-Id': deviceId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...input(), otherBuyerId: admin.user.id }),
    });
    expect(wrong.status).toBe(400);
    expect((await ledger.getWallet(who.userId)).heldKobo).toBe(0);
    const command = input(),
      saved = await client.change(item.id, command);
    expect(saved.preBid?.totalKobo).toBe(1193500);
    expect((await client.read(item.id)).preBid?.maxKobo).toBe(1000000);
    const history = createBuyerClient(base, { accessToken: token, deviceId });
    expect(
      (await history.preBids('incoming', { limit: 10 })).items[0]?.lotId,
    ).toBe(item.id);
    expect((await fetch(base + '/buyers/prebids')).status).toBe(401);
    for (const query of [
      'limit=51',
      'view=invalid',
      'userId=' + admin.user.id,
      'cursor=invalid',
    ]) {
      const response = await fetch(base + '/buyers/prebids?' + query, {
        headers: { Authorization: 'Bearer ' + token, 'X-Device-Id': deviceId },
      });
      expect(response.status).toBe(400);
    }
    const forbidden = await fetch(
      base + '/admin/lots/' + item.id + '/schedule',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'X-Device-Id': deviceId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'cancel',
          expectedUpdatedAt: item.updatedAt.toISOString(),
          idempotencyKey: randomUUID(),
          reason: 'Synthetic forbidden request',
        }),
      },
    );
    expect(forbidden.status).toBe(403);
    const result = await client.cancel(item.id, {
      expectedRevision: 1,
      idempotencyKey: randomUUID(),
    });
    expect(result.preBid?.status).toBe('cancelled');
    expect((await ledger.getWallet(who.userId)).heldKobo).toBe(0);
  } finally {
    await app.close();
  }
});
it('keeps locked pre-bid fees through launch and settlement after an admin fee change', async () => {
  const service = new PreBidService(ledger, bids),
    item = await scheduled(),
    who = await buyer();
  await service.change(who, item.id, input());
  const current = await bids.fees.read();
  const updated = auctionFeeSettingsSchema.parse(
    await bids.fees.update(admin, config(current.revision)),
  );
  expect(updated.policy.version).not.toBe(LEGACY_AUCTION_FEE_POLICY.version);
  expect((await bids.auctionFeeQuote(item.id)).policy.version).toBe(
    'auction-fees-v1',
  );
  await ledger.db.authSession.update({
    where: { id: who.sessionId },
    data: {
      createdAt: new Date(Date.now() - 10000),
      accessExpiresAt: new Date(Date.now() - 1000),
    },
  });
  await ledger.db.lot.update({
    where: { id: item.id },
    data: { startAt: new Date(Date.now() - 1000) },
  });
  await service.maintain();
  const redis = createClient({
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  });
  await redis.connect();
  try {
    const state = JSON.parse(
      String(await redis.get(bids.prefix + 'lot:' + item.id)),
    );
    expect(state.leader.bidderId).toBe(who.userId);
    expect(state.feeVersion).toBe('auction-fees-v1');
    await redis.eval(CLOSE_LUA, {
      keys: [bids.prefix],
      arguments: [item.id, String(state.endsAt + 1)],
    });
    await new ClosingService(ledger, bids).closeLot(item.id);
    const result = await ledger.db.lotSettlement.findUniqueOrThrow({
      where: { lotId: item.id },
      include: { invoice: true },
    });
    expect(result.status).toBe('paid');
    expect(result.invoice?.totalKobo).toBe(90313n);
    expect((await ledger.getWallet(who.userId)).heldKobo).toBe(0);
  } finally {
    await redis.quit();
  }
});

it('lists only owned incoming reservations, paginates safely and retains cancelled pre-bids without moving funds on reads', async () => {
  const who = await buyer(),
    other = await buyer();
  const first = await scheduled(),
    second = await scheduled(),
    foreign = await scheduled();
  const pre = new PreBidService(ledger, bids);
  const feeVersion = (await bids.fees.active()).version;
  for (const [owner, item] of [
    [who, first],
    [who, second],
    [other, foreign],
  ] as const)
    await pre.change(owner, item.id, { ...input(), feeVersion });
  const service = new BuyerService(process.env.PREBID_TEST_DATABASE_URL);
  try {
    const before = await ledger.db.ledgerEntry.count();
    const page = await service.preBids(who.userId, 1);
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeTruthy();
    expect(page.items[0]?.reservedKobo).toBe(page.items[0]?.totalKobo);
    expect(page.items[0]?.lot.thumbnailUrl).toBe(
      'https://example.test/thumb.webp',
    );
    const next = await service.preBids(
      who.userId,
      1,
      page.nextCursor ?? undefined,
    );
    expect(
      new Set([...page.items, ...next.items].map((row) => row.lotId)),
    ).toEqual(new Set([first.id, second.id]));
    expect(next.nextCursor).toBeNull();
    await expect(
      service.preBids(other.userId, 1, page.nextCursor ?? undefined),
    ).rejects.toThrow();
    await expect(
      service.preBids(who.userId, 1, page.nextCursor ?? undefined, 'cancelled'),
    ).rejects.toThrow();
    expect(await ledger.db.ledgerEntry.count()).toBe(before);
    const owned = (await pre.read(who, first.id)).preBid;
    if (!owned) throw Error('Missing fixture');
    await pre.cancel(who, first.id, {
      expectedRevision: owned.revision,
      idempotencyKey: randomUUID(),
    });
    expect(
      (await service.preBids(who.userId, 10)).items.map((row) => row.lotId),
    ).toEqual([second.id]);
    const cancelled = await service.preBids(
      who.userId,
      10,
      undefined,
      'cancelled',
    );
    expect(cancelled.items[0]?.lotId).toBe(first.id);
    expect(cancelled.items[0]?.reservedKobo).toBe(0);
    expect(JSON.stringify(cancelled)).not.toContain(other.userId);
  } finally {
    await service.onModuleDestroy();
  }
});
