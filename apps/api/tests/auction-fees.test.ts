import { createClient } from 'redis';
import { CLOSE_LUA } from '../src/closing/close-lua';
import { encryptPii, hashPii } from '../src/security/pii';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { AuctionFeeService } from '../src/bids/auction-fee-service';
import { randomUUID } from 'node:crypto';
import { BidService } from '../src/bids/bid-service';
import { ClosingService } from '../src/closing/closing-service';
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
  const url = process.env.AUCTION_FEES_TEST_DATABASE_URL;
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
it('locks first accepted fees, updates unbid lots, rejects stale preparations, and settles using the agreed policy', async () => {
  const a = await lot(),
    b = await lot(),
    c = await lot(),
    identity = await buyer();
  const token = randomUUID(),
    device = randomUUID();
  const prepare = (id: string, version: string) =>
    bids.prepare(
      identity,
      id,
      {
        maxKobo: 1000000,
        mode: 'direct',
        feeVersion: version,
        idempotencyKey: randomUUID(),
      },
      token,
      device,
    );
  const first = await prepare(a.id, LEGACY_AUCTION_FEE_POLICY.version);
  await bids.accept(
    a.id,
    {
      preparationId: first.preparationId,
      idempotencyKey: first.idempotencyKey,
    },
    token,
    device,
  );
  const stale = await prepare(b.id, LEGACY_AUCTION_FEE_POLICY.version);
  const change = config(0);
  const saved = auctionFeeSettingsSchema.parse(
    await bids.fees.update(admin, change),
  );
  expect(saved.revision).toBe(1);
  expect(saved.applied).toBe(true);
  expect((await bids.auctionFeeQuote(a.id)).policy.version).toBe(
    LEGACY_AUCTION_FEE_POLICY.version,
  );
  expect((await bids.auctionFeeQuote(b.id)).policy.version).toBe(
    saved.policy.version,
  );
  await expect(
    bids.accept(
      b.id,
      {
        preparationId: stale.preparationId,
        idempotencyKey: stale.idempotencyKey,
      },
      token,
      device,
    ),
  ).rejects.toThrow();
  await bids.cancel(identity, stale.preparationId);
  expect(
    (
      await ledger.db.bidFundingIntent.findUniqueOrThrow({
        where: { id: stale.preparationId },
      })
    ).status,
  ).toBe('released');
  await expect(
    prepare(c.id, LEGACY_AUCTION_FEE_POLICY.version),
  ).rejects.toThrow('Auction fees changed');
  const next = await prepare(c.id, saved.policy.version);
  expect(next.totalKobo).toBe(1107500);
  await bids.accept(
    c.id,
    { preparationId: next.preparationId, idempotencyKey: next.idempotencyKey },
    token,
    device,
  );
  expect((await bids.auctionFeeQuote(c.id)).locked).toBe(true);
  expect((await bids.fees.update(admin, change)).revision).toBe(1);
  expect(
    await ledger.db.auditLog.count({
      where: { action: 'auction.fees_updated' },
    }),
  ).toBe(1);
  await expect(
    bids.fees.update(admin, { ...change, premiumBps: 500 }),
  ).rejects.toThrow('another fee update');
  await expect(bids.fees.update(admin, { ...config(0) })).rejects.toThrow(
    'Reload',
  );
  await expect(
    bids.fees.update(
      {
        ...admin,
        user: { ...admin.user, id: identity.userId, role: 'buyer' },
        sessionId: identity.sessionId,
      },
      config(1),
    ),
  ).rejects.toThrow();
  const redis = createClient({
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  });
  await redis.connect();
  const closer = new ClosingService(ledger, bids);
  for (const id of [a.id, c.id]) {
    const state = JSON.parse(
      String(await redis.get(bids.prefix + 'lot:' + id)),
    );
    await redis.eval(CLOSE_LUA, {
      keys: [bids.prefix],
      arguments: [id, String(state.endsAt + 1)],
    });
    await closer.closeLot(id);
  }
  await redis.quit();
  const old = await ledger.db.lotSettlement.findUniqueOrThrow({
    where: { lotId: a.id },
    include: { invoice: true },
  });
  const updated = await ledger.db.lotSettlement.findUniqueOrThrow({
    where: { lotId: c.id },
    include: { invoice: true },
  });
  expect(old.invoice?.totalKobo).toBe(1193500n);
  expect(updated.invoice?.totalKobo).toBe(1107500n);
  expect(old.status).toBe('paid');
  expect(updated.status).toBe('paid');
  await expect(
    ledger.db.auctionFeePolicy.update({
      where: { version: saved.policy.version },
      data: { premiumBps: 999 },
    }),
  ).rejects.toThrow();
  await expect(
    ledger.db.lot.update({
      where: { id: a.id },
      data: { auctionFeeVersion: saved.policy.version },
    }),
  ).rejects.toThrow();
});
it('rejects stale simultaneous admin edits and expired sessions without duplicate policies', async () => {
  const input = config(1);
  const results = await Promise.allSettled([
    bids.fees.update(admin, input),
    bids.fees.update(admin, config(1)),
  ]);
  expect(
    results.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1);
  expect((await bids.fees.read()).revision).toBe(2);
  expect(await ledger.db.auctionFeePolicy.count()).toBe(3);
  const redis = createClient({
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  });
  await redis.connect();
  const retry = config(2);
  const activation = vi
    .spyOn(redis, 'eval')
    .mockRejectedValueOnce(new Error('Synthetic connection loss'));
  const interrupted = new AuctionFeeService(ledger, redis, bids.prefix);
  await expect(interrupted.update(admin, retry)).rejects.toThrow(
    'activation is pending',
  );
  activation.mockRestore();
  expect((await bids.fees.read()).applied).toBe(false);
  expect((await bids.fees.update(admin, retry)).revision).toBe(3);
  expect((await bids.fees.read()).applied).toBe(true);
  expect(await ledger.db.auctionFeePolicy.count()).toBe(4);
  await redis.quit();
  await ledger.db.authSession.update({
    where: { id: admin.sessionId },
    data: { accessExpiresAt: new Date(Date.now() - 1000) },
  });
  await expect(bids.fees.update(admin, config(3))).rejects.toThrow();
  expect(await ledger.db.auctionFeePolicy.count()).toBe(4);
});
