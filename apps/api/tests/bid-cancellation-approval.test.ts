import { beforeAll, afterAll, expect, it } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRealtime } from '../../realtime/src/server';
import { createRealtimeClient } from '../../../packages/api-client/src/realtime';
import { LedgerService } from '../src/ledger/ledger-service';
import { BidService } from '../src/bids/bid-service';
import { BidCancellationService } from '../src/bids/bid-cancellation-service';
import { AuthService, type AuthIdentity } from '../src/auth/auth-service';
import { SupportService } from '../src/support/support-service';
import { encryptPii, hashPii } from '../src/security/pii';
import { BuyerService } from '../src/buyers/buyer-service';
import { createApi } from '../src/app';
import { createSupportClient } from '../../../packages/api-client/src/support';
import { createClient } from 'redis';
import { CLOSE_LUA } from '../src/closing/close-lua';
let ledger: LedgerService,
  bids: BidService,
  service: BidCancellationService,
  support: SupportService,
  auth: AuthService,
  admin: AuthIdentity,
  categoryId: string,
  locationId: string;
async function actor(role: 'buyer' | 'admin' = 'buyer') {
  const email = randomUUID() + '@example.test';
  const user = await ledger.db.user.create({
    data: {
      name: 'Synthetic ' + role,
      role,
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
      emailVerifiedAt: new Date(),
    },
  });
  const session = await ledger.db.authSession.create({
    data: {
      userId: user.id,
      buyerMfa: role === 'buyer',
      staffMfa: role === 'admin',
      familyId: randomUUID(),
      deviceHash: '0'.repeat(64),
      client: 'web',
      accessHash: randomUUID().padEnd(64, '0'),
      refreshHash: randomUUID().padEnd(64, '0'),
      accessExpiresAt: new Date(Date.now() + 900000),
      expiresAt: new Date(Date.now() + 900000),
    },
  });
  const identity = {
    user: {
      id: user.id,
      name: user.name,
      role,
      status: 'active',
      emailVerified: true,
      phoneVerified: false,
    },
    sessionId: session.id,
  } as AuthIdentity;
  const wallet = await ledger.openWallet(user.id);
  await ledger.topup({
    walletId: wallet.id,
    amountKobo: 10000000n,
    idempotencyKey: randomUUID(),
    reference: randomUUID(),
  });
  return {
    identity,
    bidIdentity: { userId: user.id, sessionId: session.id },
    walletId: wallet.id,
    token: randomBytes(32).toString('base64url'),
    device: randomUUID(),
  };
}
beforeAll(async () => {
  const url = process.env.CANCELLATION_TEST_DATABASE_URL;
  if (!url || !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
    throw Error('Isolated cancellation database required');
  ledger = new LedgerService(url);
  bids = new BidService(ledger, {
    enabled: true,
    prefix: `test:cancellation:${randomUUID()}:`,
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  });
  await bids.start();
  auth = new AuthService({
    databaseUrl: url,
    mode: 'local',
    emailProvider: { async sendCode() {} },
  });
  support = new SupportService(auth);
  service = new BidCancellationService(ledger, bids, support);
  categoryId = (
    await ledger.db.category.create({
      data: { name: 'Synthetic', slug: randomUUID() },
    })
  ).id;
  locationId = (
    await ledger.db.location.create({
      data: {
        code: randomUUID().slice(0, 20),
        name: 'Synthetic Lagos',
        address: 'Test only',
        hours: {},
        capacityPerSlot: 10,
      },
    })
  ).id;
  admin = (await actor('admin')).identity;
});
afterAll(async () => {
  await auth?.onModuleDestroy();
  await bids?.close();
  await ledger?.close();
});
async function lot() {
  return ledger.db.lot.create({
    data: {
      title: 'Synthetic cancellation item',
      description: 'Test only',
      condition: 'open_box',
      retailPriceKobo: 10000000,
      startPriceKobo: 500000,
      categoryId,
      locationId,
      status: 'open',
      startAt: new Date(Date.now() - 1000),
      endAt: new Date(Date.now() + 180000),
    },
  });
}
async function bid(
  who: Awaited<ReturnType<typeof actor>>,
  id: string,
  amount: number,
) {
  const prepared = await bids.prepare(
    who.bidIdentity,
    id,
    {
      maxKobo: amount,
      mode: 'direct',
      feeVersion: 'auction-fees-v1',
      idempotencyKey: randomUUID(),
    },
    who.token,
    who.device,
  );
  const result = await bids.accept(
    id,
    {
      preparationId: prepared.preparationId,
      idempotencyKey: prepared.idempotencyKey,
    },
    who.token,
    who.device,
  );
  await bids.persist([result.streamId]);
  return prepared;
}
async function request(who: Awaited<ReturnType<typeof actor>>, id: string) {
  const r = await support.requestBidCancellation(who.identity, id, {
    reason: 'I selected the wrong product by mistake.',
    acknowledged: true,
    feeAcknowledged: true,
    idempotencyKey: randomUUID(),
  });
  if (!r.conversation) throw Error('No conversation');
  return r.conversation.id;
}
async function approval(conversationId: string) {
  const quote = await service.quote(admin, conversationId);
  return {
    expectedStreamId: quote.streamId,
    expectedFeeKobo: quote.feeKobo,
    reason: 'Approved after reviewing buyer request',
    idempotencyKey: randomUUID(),
  };
}
it('charges once, releases the leader, resets to starting price, fences old proofs and requires fresh bids', async () => {
  const row = await lot(),
    a = await actor(),
    b = await actor(),
    c = await actor();
  await bid(a, row.id, 550000);
  await bid(b, row.id, 600000);
  for (let pass = 0; pass < 3; pass++) await bids.maintain();
  const ready = await bids.prepare(
    c.bidIdentity,
    row.id,
    {
      maxKobo: 700000,
      mode: 'direct',
      feeVersion: 'auction-fees-v1',
      idempotencyKey: randomUUID(),
    },
    c.token,
    c.device,
  );
  const conversation = await request(b, row.id),
    input = await approval(conversation);
  const outcomes = await Promise.all(
    Array.from({ length: 5 }, () =>
      service.approve(admin, conversation, input),
    ),
  );
  expect(outcomes.every((r) => r.status === 'completed')).toBe(true);
  const snapshot = await bids.snapshot(null, row.id);
  expect(snapshot.currentPriceKobo).toBeNull();
  expect(Date.parse(snapshot.endsAt) - Date.now()).toBeGreaterThan(590000);
  const balance = await ledger.balances(b.walletId);
  expect(balance.heldKobo).toBe(0n);
  expect(balance.availableKobo).toBe(9910000n);
  expect((await ledger.balances(a.walletId)).availableKobo).toBe(10000000n);
  await expect(
    bids.prepare(
      b.bidIdentity,
      row.id,
      {
        maxKobo: 800000,
        mode: 'direct',
        feeVersion: 'auction-fees-v1',
        idempotencyKey: randomUUID(),
      },
      b.token,
      b.device,
    ),
  ).rejects.toBeDefined();
  await expect(
    bids.accept(
      row.id,
      {
        preparationId: ready.preparationId,
        idempotencyKey: ready.idempotencyKey,
      },
      c.token,
      c.device,
    ),
  ).rejects.toBeDefined();
  await bid(a, row.id, 500000);
  expect((await bids.snapshot(a.bidIdentity, row.id)).isLeader).toBe(true);
  const history = new BuyerService(process.env.CANCELLATION_TEST_DATABASE_URL);
  const rows = await history.bids(b.bidIdentity.userId, 10);
  expect(rows.items[0]?.outcome).toBe('cancelled');
  await history.onModuleDestroy();
  await service.maintain();
  expect(
    await ledger.db.notification.count({
      where: { template: 'bid-cancellation-v1' },
    }),
  ).toBeGreaterThanOrEqual(2);
});
it('non-leader cancellation charges available funds without changing the leader, price or deadline', async () => {
  const row = await lot(),
    a = await actor(),
    b = await actor();
  await bid(a, row.id, 550000);
  await bid(b, row.id, 600000);
  for (let pass = 0; pass < 3; pass++) await bids.maintain();
  const before = await bids.snapshot(b.bidIdentity, row.id),
    conversation = await request(a, row.id),
    input = await approval(conversation);
  expect((await service.approve(admin, conversation, input)).status).toBe(
    'completed',
  );
  const after = await bids.snapshot(b.bidIdentity, row.id);
  expect(after.currentPriceKobo).toBe(before.currentPriceKobo);
  expect(after.endsAt).toBe(before.endsAt);
  expect(after.isLeader).toBe(true);
  expect((await ledger.balances(a.walletId)).availableKobo).toBe(9910000n);
});
it('rejects stale fee/price quotes and unauthorised staff without charging', async () => {
  const row = await lot(),
    a = await actor(),
    b = await actor();
  await bid(a, row.id, 550000);
  const conversation = await request(a, row.id),
    input = await approval(conversation);
  await bid(b, row.id, 600000);
  for (let pass = 0; pass < 3; pass++) await bids.maintain();
  await expect(
    service.approve(a.identity, conversation, input),
  ).rejects.toMatchObject({ status: 403 });
  const result = await service.approve(admin, conversation, input);
  expect(result.status).toBe('failed');
  expect((await ledger.balances(a.walletId)).availableKobo).toBe(10000000n);
  expect((await bids.snapshot(b.bidIdentity, row.id)).isLeader).toBe(true);
});
it('recovers a crash after charging while fencing closing, Buy Now and competing bid confirmations', async () => {
  const row = await lot(),
    a = await actor(),
    b = await actor();
  await bid(a, row.id, 600000);
  const ready = await bids.prepare(
    b.bidIdentity,
    row.id,
    {
      maxKobo: 700000,
      mode: 'direct',
      feeVersion: 'auction-fees-v1',
      idempotencyKey: randomUUID(),
    },
    b.token,
    b.device,
  );
  const conversation = await request(a, row.id),
    input = await approval(conversation);
  service.afterCommit = async () => {
    throw Error('Synthetic lost response after database commit');
  };
  await expect(service.approve(admin, conversation, input)).rejects.toThrow(
    'Synthetic lost response',
  );
  service.afterCommit = undefined;
  const redis = createClient({
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  });
  await redis.connect();
  try {
    const frozen = JSON.parse(
      String(
        await redis.eval(CLOSE_LUA, {
          keys: [bids.prefix],
          arguments: [row.id, String(Date.now() + 3600000)],
        }),
      ),
    );
    expect(frozen.status).toBe('reserved');
    expect(
      (
        await bids.purchaseGate(
          row.id,
          randomUUID(),
          'reserve',
          Date.now() + 60000,
        )
      ).status,
    ).toBe('reserved');
    await expect(
      bids.accept(
        row.id,
        {
          preparationId: ready.preparationId,
          idempotencyKey: ready.idempotencyKey,
        },
        b.token,
        b.device,
      ),
    ).rejects.toBeDefined();
    await service.maintain();
    const result = await service.approve(admin, conversation, input);
    expect(result.status).toBe('completed');
    expect((await ledger.balances(a.walletId)).availableKobo).toBe(9910000n);
    await bid(b, row.id, 500000);
  } finally {
    await redis.close();
  }
});
it('fails non-leader approval without available fee funds and unpauses the unchanged auction', async () => {
  const row = await lot(),
    a = await actor(),
    b = await actor();
  await bid(a, row.id, 550000);
  await bid(b, row.id, 600000);
  for (let pass = 0; pass < 3; pass++) await bids.maintain();
  await ledger.hold({
    walletId: a.walletId,
    holdId: randomUUID(),
    amountKobo: 10000000n,
    idempotencyKey: randomUUID(),
    reference: 'synthetic:funds:reserved:elsewhere',
  });
  const conversation = await request(a, row.id),
    input = await approval(conversation);
  expect((await service.approve(admin, conversation, input)).status).toBe(
    'failed',
  );
  expect((await bids.snapshot(b.bidIdentity, row.id)).currentPriceKobo).toBe(
    600000,
  );
  await bid(b, row.id, 650000);
  expect((await ledger.balances(a.walletId)).heldKobo).toBe(10000000n);
});
it('never charges a legacy request without buyer fee consent', async () => {
  const row = await lot(),
    a = await actor();
  await bid(a, row.id, 600000);
  const conversation = await request(a, row.id);
  await ledger.db.supportConversation.update({
    where: { id: conversation },
    data: { bidCancellationFeeConsentAt: null },
  });
  await expect(service.quote(admin, conversation)).rejects.toMatchObject({
    status: 409,
  });
  expect(
    (await ledger.balances(a.walletId)).availableKobo +
      (await ledger.balances(a.walletId)).heldKobo,
  ).toBe(10000000n);
});
it('preserves immutable previous-round history while accepting a fresh reopened bid', async () => {
  const row = await lot(),
    a = await actor(),
    b = await actor();
  await bid(a, row.id, 600000);
  const conversation = await request(a, row.id);
  await service.approve(admin, conversation, await approval(conversation));
  await bid(b, row.id, 500000);
  const state = await bids.snapshot(b.bidIdentity, row.id);
  expect(state.isLeader).toBe(true);
  expect(state.currentPriceKobo).toBe(500000);
  await bids.persistThrough(state.streamId);
  expect(await ledger.db.bid.count({ where: { lotId: row.id } })).toBe(2);
  expect((await support.bidCancellation(a.identity, row.id)).canRequest).toBe(
    false,
  );
});
it('pushes a reopened auction through the real Socket.IO gateway without revealing private limits', async () => {
  const row = await lot(),
    a = await actor();
  await bid(a, row.id, 600000);
  const conversation = await request(a, row.id);
  const gateway = await createRealtime(
    process.env.REDIS_URL ?? 'redis://localhost:6379',
    {
      namespace: bids.prefix,
      authenticate: async () => ({
        userId: a.bidIdentity.userId,
        sessionId: a.bidIdentity.sessionId,
        expiresAt: new Date(Date.now() + 900000).toISOString(),
      }),
      snapshot: async (_credentials, id) => bids.snapshot(a.bidIdentity, id),
      publicSnapshot: async (id) => bids.snapshot(null, id),
    },
  );
  await new Promise<void>((resolve) =>
    gateway.http.listen(0, '127.0.0.1', resolve),
  );
  const address = gateway.http.address();
  if (!address || typeof address === 'string') throw Error('No test gateway');
  const client = createRealtimeClient(`http://127.0.0.1:${address.port}`, {
    credentials: () => ({ accessToken: a.token, deviceId: a.device }),
    onOutbid: () => {},
  });
  try {
    client.watchLot(row.id);
    await expect
      .poll(() => client.getSnapshot(row.id).lot?.isLeader, { timeout: 5000 })
      .toBe(true);
    await service.approve(admin, conversation, await approval(conversation));
    await expect
      .poll(() => client.getSnapshot(row.id).lot?.currentPriceKobo, {
        timeout: 5000,
      })
      .toBeNull();
    expect(client.getSnapshot(row.id).lot?.isLeader).toBe(false);
    expect(JSON.stringify(client.getSnapshot(row.id))).not.toContain('maxKobo');
  } finally {
    client.close();
    await gateway.close();
  }
});
it('enforces the typed HTTP approval boundary and rejects buyers, unknown fields and missing staff MFA', async () => {
  const a = await actor(),
    staff = await actor('admin'),
    row = await lot();
  await bid(a, row.id, 600000);
  const conversation = await request(a, row.id);
  for (const who of [a, staff])
    await ledger.db.authSession.update({
      where: { id: who.identity.sessionId },
      data: {
        accessHash: hashPii(who.token, 'auth-token'),
        deviceHash: hashPii('web:' + who.device, 'auth-device'),
      },
    });
  const app = await createApi({
    databaseUrl: process.env.CANCELLATION_TEST_DATABASE_URL,
    mode: 'local',
    emailProvider: { async sendCode() {} },
    bidOptions: { enabled: true, prefix: bids.prefix },
  });
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  const headers = {
    Authorization: 'Bearer ' + staff.token,
    'X-Device-Id': staff.device,
    'Content-Type': 'application/json',
  };
  try {
    expect(
      (await fetch(`${url}/admin/bid-cancellations/${conversation}`)).status,
    ).toBe(401);
    expect(
      (
        await fetch(`${url}/admin/bid-cancellations/${conversation}`, {
          headers: {
            Authorization: 'Bearer ' + a.token,
            'X-Device-Id': a.device,
          },
        })
      ).status,
    ).toBe(403);
    const client = createSupportClient(
      url,
      { accessToken: staff.token, deviceId: staff.device },
      true,
    );
    const quote = await client.cancellationQuote(conversation);
    const input = {
      expectedStreamId: quote.streamId,
      expectedFeeKobo: quote.feeKobo,
      reason: 'Approved after human review',
      idempotencyKey: randomUUID(),
    };
    expect(
      (
        await fetch(`${url}/admin/bid-cancellations/${conversation}/approve`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...input, feeKobo: 1 }),
        })
      ).status,
    ).toBe(400);
    expect((await client.approveCancellation(conversation, input)).status).toBe(
      'completed',
    );
    expect((await client.approveCancellation(conversation, input)).status).toBe(
      'completed',
    );
    expect((await ledger.balances(a.walletId)).availableKobo).toBe(9910000n);
    await ledger.db.authSession.update({
      where: { id: staff.identity.sessionId },
      data: { staffMfa: false },
    });
    expect(
      (
        await fetch(`${url}/admin/bid-cancellations/${conversation}`, {
          headers,
        })
      ).status,
    ).toBe(401);
  } finally {
    await app.close();
  }
});
