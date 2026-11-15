import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { flushLotMessages } from '../src/staff-admin/lot-message-delivery';
import { lotMessageEmail } from '../src/staff-admin/lot-message-email';
import { randomUUID } from 'node:crypto';
import { LedgerService } from '../src/ledger/ledger-service';
import { AuthService, type AuthIdentity } from '../src/auth/auth-service';
import { StaffAdminService } from '../src/staff-admin/staff-admin-service';
import { LiveMonitorService } from '../src/staff-admin/live-monitor-service';
import { BidService } from '../src/bids/bid-service';
import { encryptPii, decryptPii, hashPii } from '../src/security/pii';
import {
  profileSchema,
  liveMonitorPrefix,
  monitorLotsSchema,
} from '@auction-ng/shared';
import { AuctionPauseService } from '../src/bids/auction-pause-service';
import { PreBidService } from '../src/prebids/prebid-service';
import { ClosingService } from '../src/closing/closing-service';
import { CLOSE_LUA } from '../src/closing/close-lua';
import { createClient } from 'redis';
import { BidRuntimeRecovery } from '../src/bids/runtime-recovery';
import { BuyerService } from '../src/buyers/buyer-service';
import { CatalogueService } from '../src/catalogue/catalogue-service';
import { LotControlService } from '../src/staff-admin/lot-control-service';
import {
  readMonitorHistory,
  readMonitorLot,
} from '../src/staff-admin/monitor-history';
let ledger: LedgerService, categoryId: string, locationId: string;
let auth: AuthService, monitor: LiveMonitorService;
let engine: BidService;
const startAt = new Date('2026-11-07T12:00:00Z');
beforeAll(async () => {
  const url = process.env.LIVE_MONITOR_TEST_DATABASE_URL;
  if (!url || !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
    throw Error('Isolated monitor database required.');
  ledger = new LedgerService(url);
  auth = new AuthService({ databaseUrl: url, mode: 'local' });
  engine = new BidService(ledger, {
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
      data: {
        name: `Monitor test category ${randomUUID().slice(0, 8)}`,
        slug: 'monitor-' + tag,
      },
    })
  ).id;
  locationId = (
    await ledger.db.location.create({
      data: {
        name: `Monitor test centre ${randomUUID().slice(0, 8)}`,
        code: 'MON-' + tag,
        address: 'Synthetic test address',
        hours: {},
        capacityPerSlot: 10,
      },
    })
  ).id;
});
it('queues one audited bidder message and fans out once across concurrent delivery retries', async () => {
  const who = await identity('admin'),
    lot = await create('open', 24);
  const recipientEmail = randomUUID() + '@example.test';
  const user = await ledger.db.user.create({
    data: {
      name: 'Synthetic message recipient',
      role: 'buyer',
      emailVerifiedAt: new Date(),
      emailHash: hashPii(recipientEmail, 'email'),
      emailCiphertext: encryptPii(recipientEmail, 'email'),
    },
  });
  for (let i = 0; i < 2; i++)
    await ledger.db.bid.create({
      data: {
        lotId: lot.id,
        userId: user.id,
        amountKobo: 50000n,
        maxKobo: 50000n,
        idempotencyKey: randomUUID(),
      },
    });
  const cutoff = vi
    .spyOn(engine, 'persistedBidCutoff')
    .mockResolvedValue(new Date(Date.now() + 1000));
  const watcher = await identity('buyer');
  await ledger.db.watchlist.createMany({
    data: [
      { userId: user.id, lotId: lot.id },
      { userId: watcher.user.id, lotId: lot.id },
    ],
  });
  const input = {
    operation: 'message',
    idempotencyKey: randomUUID(),
    lotId: lot.id,
    reason: 'Clarifying the pickup instructions',
    message: 'Please review the updated collection instructions.',
  };
  try {
    await Promise.all([
      monitor.messageBidders(who, input),
      monitor.messageBidders(who, input),
    ]);
    expect(
      await ledger.db.lotBidderMessage.count({
        where: { id: input.idempotencyKey },
      }),
    ).toBe(1);
    // Other retained test jobs may be ahead; each flush remains bounded at fifty recipients.
    for (let i = 0; i < 10; i++)
      await Promise.all([flushLotMessages(ledger), flushLotMessages(ledger)]);
    const notices = await ledger.db.notification.findMany({
      where: {
        reference: {
          startsWith: `lot-message:${lot.id}:${input.idempotencyKey}:`,
        },
      },
    });
    expect(notices).toHaveLength(2);
    const reader = new BuyerService(process.env.LIVE_MONITOR_TEST_DATABASE_URL);
    try {
      const page = await reader.notifications(user.id, 50, undefined, true);
      expect(page.items.map((item) => item.id)).toEqual(
        notices.filter((n) => n.userId === user.id).map((n) => n.id),
      );
      expect(page.items[0]?.title).toContain(input.message);
      expect(
        (await reader.notifications(who.user.id, 50, undefined, true)).items,
      ).toEqual([]);
      await reader.readNotifications(
        user.id,
        page.items.map((item) => item.id),
      );
      expect(
        (await reader.notifications(user.id, 50, undefined, true)).items,
      ).toEqual([]);
      expect((await reader.notifications(user.id, 50)).items).toHaveLength(1);
    } finally {
      await reader.db.$disconnect();
    }
    const job = await ledger.db.lotBidderMessage.findUniqueOrThrow({
      where: { id: input.idempotencyKey },
    });
    expect(job.recipientCount).toBe(2);
    expect(job.completedAt).not.toBeNull();
    expect(
      await ledger.db.auditLog.count({
        where: { actorId: who.user.id, action: 'staff.lot_bidders_messaged' },
      }),
    ).toBe(1);
    await expect(
      monitor.messageBidders(who, {
        ...input,
        message: 'A different message on the same key',
      }),
    ).rejects.toThrow();
    expect(
      lotMessageEmail({
        lotId: lot.id,
        lotNumber: lot.lotNumber,
        title: 'Phone <script>',
        message: 'Please collect <script>alert(1)</script>',
      }).HTML,
    ).not.toContain('<script>');
  } finally {
    cutoff.mockRestore();
  }
});
afterAll(async () => {
  await monitor?.onModuleDestroy();
  await auth?.close();
  await ledger?.close();
});
it('opens reason-free paginated history for monitor staff, masks names and audits administrator name access', async () => {
  const staff = new StaffAdminService(ledger, auth, {
      fenceEligibility: async () => {},
    }),
    admin = await identity('admin'),
    manager = await identity('manager'),
    lot = await create('open', 24),
    buyer = await identity('buyer');
  await ledger.db.bid.createMany({
    data: [
      {
        lotId: lot.id,
        userId: buyer.user.id,
        amountKobo: 900000n,
        maxKobo: 900000n,
        isProxy: true,
        role: null,
        idempotencyKey: randomUUID(),
      },
      {
        lotId: lot.id,
        userId: buyer.user.id,
        amountKobo: 50000n,
        maxKobo: 900000n,
        isProxy: false,
        role: null,
        idempotencyKey: randomUUID(),
      },
    ],
  });
  const masked = await readMonitorHistory(staff, manager, lot.id, { limit: 1 });
  expect(masked.fullNames).toBe(false);
  expect(masked.items[0]?.bidder).not.toBe(buyer.user.name);
  expect(masked.nextCursor).toBeTruthy();
  const full = await readMonitorHistory(staff, admin, lot.id, {});
  expect(full.fullNames).toBe(true);
  expect(full.items.some((i) => i.amountKobo === null)).toBe(true);
  expect(full.items.some((i) => i.amountKobo === 900000)).toBe(false);
  expect(
    await ledger.db.auditLog.count({
      where: {
        actorId: admin.user.id,
        action: 'live.bidder_names_viewed',
        entityId: lot.id,
      },
    }),
  ).toBe(1);
  await expect(readMonitorHistory(staff, buyer, lot.id, {})).rejects.toThrow();
  expect((await readMonitorLot(staff, admin, lot.id, {})).title).toBe(
    lot.title,
  );
});
it('searches the complete live projection before pagination and preserves access checks', async () => {
  const staff = new StaffAdminService(ledger, auth, {
    fenceEligibility: async () => {},
  });
  const admin = await identity('admin');
  const prefix = 'test:live-search:' + randomUUID() + ':';
  const readerEngine = new BidService(ledger, { enabled: false, prefix });
  const reader = new LiveMonitorService(staff, readerEngine);
  const redis = createClient({
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  });
  await redis.connect();
  const base = liveMonitorPrefix(prefix),
    key = base + 'current';
  const stamp = new Date().toISOString();
  try {
    await redis.set(
      base + 'live_auction_stats',
      JSON.stringify({ serverTime: stamp, revision: 1 }),
      { EX: 120 },
    );
    await redis.set(
      key + ':summary',
      JSON.stringify({
        serverTime: stamp,
        revision: 1,
        observedSince: stamp,
        paused: false,
        phase: 'live',
        liveCount: 260,
        closing15Count: 0,
        endingHourCount: 0,
        endedTodayCount: 0,
        soldTodayCount: 0,
        gmvTodayKobo: 0,
        bidsPerMinute: 0,
        bidsPeak: 0,
        bidsPeakAt: null,
        onlineBuyers: null,
        onlineBidBuyers: null,
        extensionCount: 0,
        extendedLotCount: 0,
      }),
      { EX: 120 },
    );
    const rows = Array.from({ length: 260 }, (_, i) => ({
      id: randomUUID(),
      reference: 'LVTEST' + i,
      title:
        i === 210 || i === 250
          ? 'Samsung search fixture'
          : 'Other live fixture',
      thumbnail: null,
      categoryId,
      category: 'Phones',
      locationId,
      location: 'Lekki',
      runTimeMs: 3600000,
      endsAt: new Date(Date.now() + i * 1000).toISOString(),
      currentPriceKobo: 50000,
      bidCount: 0,
      watchers: 0,
      extensions: 0,
      leading: null,
      area: null,
      paused: false,
      remainingMs: null,
      revision: '1-0',
      streamId: '1-0',
      serverTime: stamp,
    }));
    await redis.hSet(
      key + ':rows',
      Object.fromEntries(rows.map((row) => [row.id, JSON.stringify(row)])),
    );
    await redis.zAdd(
      key + ':order:all:all',
      rows.map((row) => ({ score: Date.parse(row.endsAt), value: row.id })),
    );
    await redis.expire(key + ':rows', 120);
    await redis.expire(key + ':order:all:all', 120);
    const first = monitorLotsSchema.parse(
      await reader.read(admin, 'lots', { search: '  SAMSUNG  ', limit: 1 }),
    );
    expect(first.items.map((row) => row.reference)).toEqual(['LVTEST210']);
    expect(first.nextCursor).toBeTruthy();
    const second = monitorLotsSchema.parse(
      await reader.read(admin, 'lots', {
        search: 'Samsung',
        limit: 1,
        cursor: first.nextCursor,
      }),
    );
    expect(second.items.map((row) => row.reference)).toEqual(['LVTEST250']);
    expect(second.nextCursor).toBeNull();
    expect(
      monitorLotsSchema.parse(
        await reader.read(admin, 'lots', { search: 'lvtest259' }),
      ).items[0]?.reference,
    ).toBe('LVTEST259');
    expect(
      monitorLotsSchema.parse(
        await reader.read(admin, 'lots', { search: 'not-found' }),
      ).items,
    ).toEqual([]);
    await expect(
      reader.read(await identity('buyer'), 'lots', { search: 'Samsung' }),
    ).rejects.toThrow();
    await expect(
      reader.read(admin, 'lots', { search: 'x'.repeat(121) }),
    ).rejects.toThrow();
  } finally {
    await reader.onModuleDestroy();
    await readerEngine.close();
    await redis.quit();
  }
});

it('returns original lot creator and creation time without treating an editor as creator', async () => {
  const staff = new StaffAdminService(ledger, auth, {
    fenceEligibility: async () => {},
  });
  const admin = await identity('admin');
  const editor = await identity('manager');
  const lot = await create('open', 24);
  await ledger.db.auditLog.create({
    data: {
      actorId: editor.user.id,
      action: 'lots.updated',
      entityType: 'lot',
      entityId: lot.id,
    },
  });
  const legacy = await readMonitorLot(staff, admin, lot.id, {});
  expect(legacy.createdBy).toBeNull();
  expect(legacy.createdAt).toBe(lot.createdAt.toISOString());
  await ledger.db.auditLog.create({
    data: {
      actorId: admin.user.id,
      action: 'lots.created',
      entityType: 'lot',
      entityId: lot.id,
    },
  });
  const recorded = await readMonitorLot(staff, editor, lot.id, {});
  expect(recorded.createdBy).toBe(admin.user.name);
  expect(recorded.createdAt).toBe(lot.createdAt.toISOString());
  await expect(
    readMonitorLot(staff, await identity('buyer'), lot.id, {}),
  ).rejects.toThrow();
});
it('recovers a committed individual pause, extends/resumes once and cancels without losing held money or bid history', async () => {
  const bids = new BidService(ledger, {
      enabled: true,
      prefix: 'test:individual:' + randomUUID() + ':',
      redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    }),
    staff = new StaffAdminService(ledger, auth, {
      fenceEligibility: async () => {},
    }),
    controls = new LotControlService(staff, bids);
  const admin = await identity('admin'),
    manager = await identity('manager'),
    buyer = await identity('buyer'),
    base = await create('open', 24),
    now = Date.now();
  const lot = await ledger.db.lot.update({
    where: { id: base.id },
    data: { startAt: new Date(now - 60000), endAt: new Date(now + 600000) },
  });
  await ledger.db.authSession.update({
    where: { id: buyer.sessionId },
    data: { buyerMfa: true },
  });
  const wallet = await ledger.openWallet(buyer.user.id);
  await ledger.topup({
    walletId: wallet.id,
    amountKobo: 10000000n,
    idempotencyKey: randomUUID(),
    reference: randomUUID(),
  });
  try {
    await bids.start();
    const token = randomUUID(),
      device = randomUUID(),
      requestKey = randomUUID();
    const prepared = await bids.prepare(
      { userId: buyer.user.id, sessionId: buyer.sessionId },
      lot.id,
      {
        maxKobo: 100000,
        mode: 'direct',
        idempotencyKey: requestKey,
        feeVersion: (await bids.fees.active()).version,
      },
      token,
      device,
    );
    await bids.accept(
      lot.id,
      { preparationId: prepared.preparationId, idempotencyKey: requestKey },
      token,
      device,
    );
    const initial = await controls.quote(admin, lot.id);
    expect(initial.heldKobo).toBeGreaterThan(100000);
    const input = {
      lotId: lot.id,
      idempotencyKey: randomUUID(),
      operation: 'pause',
      expectedRevision: initial.revision,
      reason: 'Checking the listing photos',
    };
    controls.afterCommit = async () => {
      throw Error('synthetic crash after durable SQL commit');
    };
    await expect(controls.request(admin, input)).rejects.toThrow(
      'synthetic crash',
    );
    expect(await bids.freezeLot(lot.id)).toBeNull();
    controls.afterCommit = undefined;
    await controls.advance(input.idempotencyKey);
    const paused = await bids.snapshot(null, lot.id);
    expect(paused.pausedAt).toBeDefined();
    const quote = await controls.quote(manager, lot.id);
    const extend = {
      lotId: lot.id,
      idempotencyKey: randomUUID(),
      operation: 'extend',
      expectedRevision: quote.revision,
      extensionMs: 1800000,
      reason: 'Additional time after listing correction',
    };
    await Promise.all([
      controls.request(manager, extend),
      controls.request(manager, extend),
    ]);
    expect((await bids.snapshot(null, lot.id)).endsAt).toBe(
      new Date(Date.parse(paused.endsAt) + 1800000).toISOString(),
    );
    const extensionNotice = await ledger.db.lotBidderMessage.findUniqueOrThrow({
      where: { id: extend.idempotencyKey },
    });
    expect(
      decryptPii(Buffer.from(extensionNotice.messageCiphertext), 'lot-message'),
    ).toContain('30 minutes');
    const resumeQuote = await controls.quote(manager, lot.id);
    const resumeInput = {
      lotId: lot.id,
      idempotencyKey: randomUUID(),
      operation: 'resume',
      expectedRevision: resumeQuote.revision,
      reason: 'Listing review is complete',
    };
    controls.afterCommit = async () => {
      throw Error('synthetic interrupted resume');
    };
    await expect(controls.request(manager, resumeInput)).rejects.toThrow(
      'synthetic interrupted resume',
    );
    expect((await bids.snapshot(null, lot.id)).pausedAt).toBeDefined();
    controls.afterCommit = undefined;
    await new Promise((resolve) => setTimeout(resolve, 100));
    await controls.advance(resumeInput.idempotencyKey);
    const resumed = await controls.quote(manager, lot.id);
    expect(resumed.paused).toBe(false);
    expect(
      Math.abs(resumed.remainingMs - resumeQuote.remainingMs),
    ).toBeLessThan(3000);
    const cancel = {
      lotId: lot.id,
      idempotencyKey: randomUUID(),
      operation: 'cancel',
      expectedRevision: resumed.revision,
      category: 'item_missing',
      reason: 'Warehouse cannot locate this item',
    };
    await controls.request(admin, cancel);
    await controls.request(admin, cancel);
    expect((await ledger.balances(wallet.id)).availableKobo).toBe(10000000n);
    expect(
      await ledger.db.walletHold.count({
        where: { walletId: wallet.id, status: 'active' },
      }),
    ).toBe(0);
    expect(
      (await ledger.db.lot.findUniqueOrThrow({ where: { id: lot.id } })).status,
    ).toBe('cancelled');
    expect(
      await ledger.db.bid.count({ where: { lotId: lot.id } }),
    ).toBeGreaterThan(0);
    expect(
      await ledger.db.lotSettlement.count({ where: { lotId: lot.id } }),
    ).toBe(0);
    expect((await bids.snapshot(null, lot.id)).isLeader).toBe(false);
    const catalogue = new CatalogueService(
      process.env.LIVE_MONITOR_TEST_DATABASE_URL,
    );
    try {
      expect((await catalogue.detail(lot.id)).status).toBe('cancelled');
      expect((await catalogue.result(lot.id)).state).toBe('closed');
    } finally {
      await catalogue.onModuleDestroy();
    }
    expect(
      await ledger.db.auditLog.count({
        where: { entityId: lot.id, action: 'lot.cancel' },
      }),
    ).toBe(1);
    expect(
      await ledger.db.lotBidderMessage.count({
        where: { id: cancel.idempotencyKey },
      }),
    ).toBe(1);
    const recoveryRedis = createClient({
      url: process.env.REDIS_URL ?? 'redis://localhost:6379',
    });
    recoveryRedis.on('error', () => {});
    await recoveryRedis.connect();
    try {
      const recovery = new BidRuntimeRecovery(
        ledger,
        recoveryRedis,
        bids.prefix,
        { assertOffline: async () => {} },
      );
      expect((await recovery.audit()).activeHoldCount).toBe(0);
    } finally {
      await recoveryRedis.quit();
    }
    await expect(
      controls.request(buyer, { ...cancel, idempotencyKey: randomUUID() }),
    ).rejects.toThrow();
  } finally {
    await bids.close();
  }
}, 60000);
it('durably pauses and restores clocks once after a crash between Redis and SQL, preserving immutable runtime', async () => {
  const engine = new BidService(ledger, {
    enabled: true,
    prefix: 'test:global-pause:' + randomUUID() + ':',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  });
  const staff = new StaffAdminService(ledger, auth, {
    fenceEligibility: async () => {},
  });
  const monitor = new LiveMonitorService(staff, engine);
  const now = Date.now();
  const lot = await create('open', 24);
  const open = await ledger.db.lot.update({
    where: { id: lot.id },
    data: { startAt: new Date(now - 60000), endAt: new Date(now + 600000) },
  });
  const future = await create('scheduled', 24);
  const expiredFixture = await create('open', 24);
  const expired = await ledger.db.lot.update({
    where: { id: expiredFixture.id },
    data: { endAt: new Date(now - 1000) },
  });
  const scheduled = await ledger.db.lot.update({
    where: { id: future.id },
    data: { startAt: new Date(now + 60000), endAt: new Date(now + 3600000) },
  });
  try {
    await engine.start();
    const buyer = await identity('buyer');
    await ledger.db.authSession.update({
      where: { id: buyer.sessionId },
      data: { buyerMfa: true },
    });
    const wallet = await ledger.openWallet(buyer.user.id);
    await ledger.topup({
      walletId: wallet.id,
      amountKobo: 10000000n,
      idempotencyKey: randomUUID(),
      reference: randomUUID(),
    });
    const bidder = { userId: buyer.user.id, sessionId: buyer.sessionId };
    const bidKey = randomUUID(),
      token = randomUUID(),
      device = randomUUID();
    const prepared = await engine.prepare(
      bidder,
      open.id,
      {
        maxKobo: 100000,
        mode: 'direct',
        idempotencyKey: bidKey,
        feeVersion: (await engine.fees.active()).version,
      },
      token,
      device,
    );
    await engine.accept(
      open.id,
      { preparationId: prepared.preparationId, idempotencyKey: bidKey },
      token,
      device,
    );
    await engine.persistedBidCutoff();
    const preBids = new PreBidService(ledger, engine);
    const pre = await preBids.change(bidder, scheduled.id, {
      maxKobo: 100000,
      feeVersion: (await engine.fees.active()).version,
      expectedRevision: 0,
      idempotencyKey: randomUUID(),
    });
    const before = await ledger.balances(wallet.id);
    const who = await identity('admin');
    const request = {
      operation: 'pause_all',
      idempotencyKey: randomUUID(),
      reason: 'Testing emergency pause recovery',
      confirmation: 'PAUSE',
      expectedRevision: 'live:initial',
    };
    await Promise.all([
      monitor.controlBidding(who, request),
      monitor.controlBidding(who, request),
    ]);
    const paused = await engine.auctionPauseState();
    expect(paused.phase).toBe('paused');
    expect((await engine.snapshot(null, open.id)).pausedAt).toBe(
      paused.pausedAt,
    );
    expect(await ledger.balances(wallet.id)).toEqual(before);
    await expect(
      ledger.db.$transaction((tx) => engine.guardAuctionPublication(tx)),
    ).rejects.toThrow('paused');
    await expect(engine.beginScheduledLaunch(scheduled.id)).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const actual = engine.applyResumeLot.bind(engine);
    const crash = vi
      .spyOn(engine, 'applyResumeLot')
      .mockImplementationOnce(async (...args) => {
        await actual(...args);
        throw Error('Simulated process interruption after Redis');
      });
    await expect(
      monitor.controlBidding(who, {
        operation: 'resume_all',
        idempotencyKey: randomUUID(),
        reason: 'Restoring countdowns after review',
        confirmation: 'RESUME',
        expectedRevision: `paused:${paused.pauseId}`,
      }),
    ).rejects.toThrow('Simulated');
    crash.mockRestore();
    expect((await engine.auctionPauseState()).phase).toBe('resuming');
    const restarted = new AuctionPauseService(ledger, engine);
    for (
      let i = 0;
      i < 30 && (await engine.auctionPauseState()).phase !== 'live';
      i++
    )
      await restarted.advance();
    const state = await engine.auctionPauseState();
    expect(state.phase).toBe('live');
    const delta = (state.resumedAt ?? 0) - (state.pausedAt ?? 0);
    expect(delta).toBeGreaterThanOrEqual(30);
    const restored = await ledger.db.lot.findUniqueOrThrow({
      where: { id: open.id },
    });
    expect(restored.endAt.getTime()).toBe(open.endAt.getTime() + delta);
    expect(restored.originalRunTimeMs).toBe(open.originalRunTimeMs);
    expect((await engine.monitorBooks([open.id])).states[0]?.endsAt).toBe(
      restored.endAt.getTime(),
    );
    const schedule = await ledger.db.lot.findUniqueOrThrow({
      where: { id: scheduled.id },
    });
    expect(schedule.startAt.getTime()).toBe(
      scheduled.startAt.getTime() + delta,
    );
    expect(schedule.scheduleVersion).toBe(scheduled.scheduleVersion + 1);
    expect(
      (
        await ledger.db.lot.findUniqueOrThrow({ where: { id: expired.id } })
      ).endAt.getTime(),
    ).toBe(expired.endAt.getTime());
    expect(await ledger.balances(wallet.id)).toEqual(before);
    await preBids.maintain();
    expect(
      (
        await ledger.db.preBid.findUniqueOrThrow({
          where: { id: pre.preBid?.id ?? '' },
        })
      ).status,
    ).toBe('cancelled');
    expect((await ledger.balances(wallet.id)).heldKobo).toBe(
      before.heldKobo - BigInt(pre.preBid?.totalKobo ?? 0),
    );
    expect(
      await ledger.db.notification.count({
        where: { userId: buyer.user.id, template: 'prebid-v1' },
      }),
    ).toBe(1);
    const redis = createClient({
      url: process.env.REDIS_URL ?? 'redis://localhost:6379',
    });
    redis.on('error', () => {});
    await redis.connect();
    try {
      await redis.eval(CLOSE_LUA, {
        keys: [engine.prefix],
        arguments: [open.id, String(restored.endAt.getTime() + 1)],
      });
      const closer = new ClosingService(ledger, engine);
      await Promise.all([closer.closeLot(open.id), closer.closeLot(open.id)]);
      const settlement = await ledger.db.lotSettlement.findUniqueOrThrow({
        where: { lotId: open.id },
      });
      expect(settlement.status).toBe('paid');
      const invoice = await ledger.db.invoice.findUniqueOrThrow({
        where: { id: settlement.invoiceId ?? '' },
      });
      expect((await ledger.balances(wallet.id)).heldKobo).toBe(0n);
      expect((await ledger.balances(wallet.id)).availableKobo).toBe(
        10000000n - invoice.totalKobo,
      );
      await engine.close();
      const recovery = new BidRuntimeRecovery(ledger, redis, engine.prefix, {
        assertOffline: async () => {},
      });
      expect((await recovery.audit()).acceptedCount).toBe(1);
    } finally {
      await redis.quit();
    }
    expect(
      await ledger.db.auditLog.count({
        where: { actorId: who.user.id, action: 'staff.auction_pause_all' },
      }),
    ).toBe(1);
  } finally {
    await monitor.onModuleDestroy();
    await engine.close();
  }
}, 60000);
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
it('rejects non-admin global controls and buyers attempting to message bidders before touching the engine', async () => {
  const manager = await identity('manager');
  await expect(
    monitor.controlBidding(manager, {
      operation: 'pause_all',
      idempotencyKey: randomUUID(),
      confirmation: 'PAUSE',
      reason: 'Attempting an emergency pause',
      expectedRevision: 'live:initial',
    }),
  ).rejects.toThrow();
  expect(
    await ledger.db.auctionPauseCommand.count({
      where: { actorId: manager.user.id },
    }),
  ).toBe(0);
  const buyer = await identity('buyer');
  const cutoff = vi.spyOn(engine, 'persistedBidCutoff');
  try {
    await expect(
      monitor.messageBidders(buyer, {
        operation: 'message',
        idempotencyKey: randomUUID(),
        lotId: randomUUID(),
        reason: 'Attempting a restricted message',
        message: 'This should never be queued.',
      }),
    ).rejects.toThrow();
    expect(cutoff).not.toHaveBeenCalled();
  } finally {
    cutoff.mockRestore();
  }
});
