import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID, randomInt, randomBytes } from 'node:crypto';
import { BidService } from '../src/bids/bid-service';
import { LedgerService } from '../src/ledger/ledger-service';
import { estimatedTotal } from '@auction-ng/shared';
import { encryptPii, hashPii } from '../src/security/pii';
import { createApi } from '../src/app';
import { createAuthClient } from '../../../packages/api-client/src/auth';
import { createBidClient } from '../../../packages/api-client/src/bids';
import { createServer, connect, type Socket } from 'node:net';
import { startBidWorker } from '../../worker/src/bid-worker';

let ledger: LedgerService;
let bids: BidService;
let categoryId: string;
let locationId: string;
beforeAll(async () => {
  const url = process.env.BID_TEST_DATABASE_URL;
  if (!url || !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
    throw new Error('Isolated bid database required.');
  ledger = new LedgerService(url);
  bids = new BidService(ledger, {
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    prefix: `test:funding:${randomUUID()}:`,
    enabled: true,
  });
  await bids.start();
  categoryId = (
    await ledger.db.category.create({
      data: { name: 'Test', slug: randomUUID() },
    })
  ).id;
  locationId = (
    await ledger.db.location.create({
      data: {
        code: randomUUID().slice(0, 30),
        name: 'Lagos test',
        address: 'Synthetic warehouse, Lagos',
        hours: {},
        capacityPerSlot: 20,
      },
    })
  ).id;
});
afterAll(async () => {
  await bids?.close();
  await ledger?.close();
});
async function buyer(amount = 10000000n, verified = true) {
  const email = `bid-${randomUUID()}@example.test`;
  const phone = `+234${randomInt(1000000000, 9999999999)}`;
  const user = await ledger.db.user.create({
    data: {
      name: 'Synthetic bidder',
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
      phoneHash: hashPii(phone, 'phone'),
      phoneCiphertext: encryptPii(phone, 'phone'),
      phoneVerifiedAt: verified ? new Date() : null,
    },
  });
  const wallet = await ledger.openWallet(user.id);
  if (amount)
    await ledger.topup({
      walletId: wallet.id,
      amountKobo: amount,
      idempotencyKey: randomUUID(),
      reference: randomUUID(),
    });
  const token = randomUUID();
  const device = randomUUID();
  const session = await ledger.db.authSession.create({
    data: {
      userId: user.id,
      familyId: randomUUID(),
      deviceHash: '0'.repeat(64),
      client: 'web',
      accessHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
      refreshHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
      accessExpiresAt: new Date(Date.now() + 900000),
      expiresAt: new Date(Date.now() + 900000),
    },
  });
  return {
    userId: user.id,
    sessionId: session.id,
    walletId: wallet.id,
    token,
    device,
  };
}
async function lot() {
  return ledger.db.lot.create({
    data: {
      lotNumber: randomUUID(),
      title: 'Test kettle',
      description: 'Synthetic',
      condition: 'open_box',
      retailPriceKobo: 1000000n,
      startPriceKobo: 50000n,
      status: 'open',
      startAt: new Date(Date.now() - 1000),
      endAt: new Date(Date.now() + 300000),
      categoryId,
      locationId,
    },
  });
}
async function prepare(
  who: Awaited<ReturnType<typeof buyer>>,
  lotId: string,
  maxKobo = 100000,
) {
  return bids.prepare(
    who,
    lotId,
    { maxKobo, idempotencyKey: randomUUID() },
    who.token,
    who.device,
  );
}
it('rejects empty wallets and unverified buyers without issuing usable funding proofs', async () => {
  const item = await lot();
  await expect(prepare(await buyer(0n), item.id)).rejects.toThrow();
  await expect(
    prepare(await buyer(10000000n, false), item.id),
  ).rejects.toThrow();
});
it('binds the mode to a funded intent and never reinterprets a retry', async () => {
  const who = await buyer();
  const item = await lot();
  const input = { maxKobo: 500000, idempotencyKey: randomUUID() };
  const direct = await bids.prepare(who, item.id, input, who.token, who.device);
  expect(direct.mode).toBe('direct');
  expect(
    (
      await ledger.db.bidFundingIntent.findUniqueOrThrow({
        where: { id: direct.preparationId },
      })
    ).mode,
  ).toBe('direct');
  await expect(
    bids.prepare(
      who,
      item.id,
      { ...input, mode: 'automatic' },
      who.token,
      who.device,
    ),
  ).rejects.toThrow();
  const accepted = await bids.accept(item.id, direct, who.token, who.device);
  expect(accepted.currentPriceKobo).toBe(500000);
  expect(accepted.mode).toBe('direct');
  await expect(
    ledger.db.bidFundingIntent.update({
      where: { id: direct.preparationId },
      data: { mode: 'automatic' },
    }),
  ).rejects.toThrow();
  expect((await ledger.balances(who.walletId)).heldKobo).toBe(
    BigInt(estimatedTotal(500000)),
  );
});
it('uses an explicit automatic limit against direct bids and releases losing funds once', async () => {
  const a = await buyer();
  const b = await buyer();
  const item = await lot();
  const automatic = await bids.prepare(
    a,
    item.id,
    { maxKobo: 1000000, mode: 'automatic', idempotencyKey: randomUUID() },
    a.token,
    a.device,
  );
  expect(
    (await bids.accept(item.id, automatic, a.token, a.device)).currentPriceKobo,
  ).toBe(50000);
  const direct = await prepare(b, item.id, 500000);
  const result = await bids.accept(item.id, direct, b.token, b.device);
  expect(result).toMatchObject({
    currentPriceKobo: 510000,
    isLeader: false,
    mode: 'direct',
  });
  expect(await bids.accept(item.id, direct, b.token, b.device)).toEqual(result);
  await bids.maintain();
  await bids.maintain();
  expect((await ledger.balances(b.walletId)).heldKobo).toBe(0n);
  expect((await ledger.balances(a.walletId)).heldKobo).toBe(
    BigInt(estimatedTotal(1000000)),
  );
  const winner = await prepare(b, item.id, 1200000);
  expect(await bids.accept(item.id, winner, b.token, b.device)).toMatchObject({
    currentPriceKobo: 1200000,
    isLeader: true,
  });
  await bids.maintain();
  // The bounded UUID cursor may visit only the newly inserted winner on this pass.
  await bids.maintain();
  expect((await ledger.balances(a.walletId)).heldKobo).toBe(0n);
});
it('reserves once, rejects changed retry payloads and accepts exact confirmations once', async () => {
  const who = await buyer();
  const item = await lot();
  const input = { maxKobo: 100000, idempotencyKey: randomUUID() };
  const first = await bids.prepare(who, item.id, input, who.token, who.device);
  expect(
    await bids.prepare(who, item.id, input, who.token, who.device),
  ).toEqual(first);
  await expect(
    bids.prepare(
      who,
      item.id,
      { ...input, maxKobo: 200000 },
      who.token,
      who.device,
    ),
  ).rejects.toThrow();
  expect((await ledger.balances(who.walletId)).heldKobo).toBe(
    BigInt(estimatedTotal(100000)),
  );
  const result = await bids.accept(item.id, first, who.token, who.device);
  expect(await bids.accept(item.id, first, who.token, who.device)).toEqual(
    result,
  );
  await bids.cancel(who, first.preparationId);
  await bids.maintain();
  expect((await ledger.balances(who.walletId)).heldKobo).toBe(
    BigInt(estimatedTotal(100000)),
  );
});
it('raises only the delta and releases every additive hold after being outbid', async () => {
  const who = await buyer();
  const other = await buyer();
  const item = await lot();
  const first = await prepare(who, item.id);
  await bids.accept(item.id, first, who.token, who.device);
  const raise = await prepare(who, item.id, 200000);
  expect(raise.reservedKobo).toBe(
    estimatedTotal(200000) - estimatedTotal(100000),
  );
  await bids.accept(item.id, raise, who.token, who.device);
  expect((await ledger.balances(who.walletId)).heldKobo).toBe(
    BigInt(estimatedTotal(200000)),
  );
  const challenger = await prepare(other, item.id, 300000);
  await bids.accept(item.id, challenger, other.token, other.device);
  await bids.maintain();
  await bids.maintain();
  expect(await ledger.balances(who.walletId)).toEqual({
    availableKobo: 10000000n,
    heldKobo: 0n,
  });
});
it('serializes cross-lot reservations against the same wallet and never overspends', async () => {
  const who = await buyer(BigInt(estimatedTotal(100000)));
  const items = [];
  for (let index = 0; index < 10; index++) items.push(await lot());
  const results = await Promise.allSettled(
    items.map((item) => prepare(who, item.id)),
  );
  expect(
    results.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1);
  expect((await ledger.balances(who.walletId)).availableKobo).toBe(0n);
});
it('cancel versus accept has one terminal outcome, with no released winning funds', async () => {
  const who = await buyer();
  const item = await lot();
  const proof = await prepare(who, item.id);
  const results = await Promise.allSettled([
    bids.accept(item.id, proof, who.token, who.device),
    bids.cancel(who, proof.preparationId),
  ]);
  await bids.maintain();
  const accepted = results[0]?.status === 'fulfilled';
  expect((await ledger.balances(who.walletId)).heldKobo).toBe(
    accepted ? BigInt(estimatedTotal(100000)) : 0n,
  );
});
it('revokes pending proofs before a session can be revoked in PostgreSQL', async () => {
  const who = await buyer();
  const item = await lot();
  const proof = await prepare(who, item.id);
  await bids.revokeSessions([who.sessionId]);
  await expect(
    bids.accept(item.id, proof, who.token, who.device),
  ).rejects.toThrow();
  await bids.maintain();
  expect((await ledger.balances(who.walletId)).heldKobo).toBe(0n);
});
it('expires unfinished preparations and releases the ledger hold once', async () => {
  const engine = new BidService(ledger, {
    enabled: true,
    prefix: `test:expiry:${randomUUID()}:`,
    preparationMs: 1,
  });
  try {
    await engine.start();
    const who = await buyer();
    const item = await lot();
    const proof = await engine.prepare(
      who,
      item.id,
      { maxKobo: 100000, idempotencyKey: randomUUID() },
      who.token,
      who.device,
    );
    await expect(
      engine.accept(item.id, proof, who.token, who.device),
    ).rejects.toThrow();
    await engine.maintain();
    await engine.maintain();
    expect(await ledger.balances(who.walletId)).toEqual({
      availableKobo: 10000000n,
      heldKobo: 0n,
    });
  } finally {
    await engine.close();
  }
});
it('rejects another device, token, lot or retry key without consuming the rightful preparation', async () => {
  const who = await buyer();
  const item = await lot();
  const proof = await prepare(who, item.id);
  await expect(
    bids.accept(item.id, proof, who.token, randomUUID()),
  ).rejects.toThrow();
  await expect(
    bids.accept(item.id, proof, randomUUID(), who.device),
  ).rejects.toThrow();
  await expect(
    bids.accept(randomUUID(), proof, who.token, who.device),
  ).rejects.toThrow();
  await expect(
    bids.accept(
      item.id,
      { ...proof, idempotencyKey: randomUUID() },
      who.token,
      who.device,
    ),
  ).rejects.toThrow();
  expect(
    (await bids.accept(item.id, proof, who.token, who.device)).isLeader,
  ).toBe(true);
});
it('pauses on an unexpected Redis process identity and never releases uncertain reservations', async () => {
  const prefix = `test:recovery:${randomUUID()}:`;
  await ledger.db.bidEngineRuntime.create({
    data: { namespace: prefix, redisRunId: 'unexpected-restarted-process' },
  });
  const engine = new BidService(ledger, { enabled: true, prefix });
  await expect(engine.start()).rejects.toThrow();
  await engine.close();
});
it('requires a Redis fence before suspension and prevents the pending bid after that fence', async () => {
  const who = await buyer();
  const item = await lot();
  const proof = await prepare(who, item.id);
  await expect(
    ledger.db.user.update({
      where: { id: who.userId },
      data: { status: 'suspended' },
    }),
  ).rejects.toThrow();
  await expect(
    ledger.db.authSession.update({
      where: { id: who.sessionId },
      data: { revokedAt: new Date() },
    }),
  ).rejects.toThrow();
  await ledger.db.$transaction(async (tx) => {
    await bids.fenceEligibility(tx, who.userId);
    await tx.user.update({
      where: { id: who.userId },
      data: { status: 'suspended' },
    });
  });
  await expect(
    bids.accept(item.id, proof, who.token, who.device),
  ).rejects.toThrow();
  await bids.maintain();
  expect((await ledger.balances(who.walletId)).heldKobo).toBe(0n);
});
it('recovers a dropped acceptance reply by replaying the original durable result without another hold', async () => {
  const upstream = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const sockets = new Set<Socket>();
  let drop = false;
  const proxy = createServer((client) => {
    const server = connect(Number(upstream.port || 6379), upstream.hostname);
    sockets.add(client);
    sockets.add(server);
    client.on('data', (data) => {
      if (data.includes(Buffer.from('\r\n$6\r\naccept\r\n'))) drop = true;
      server.write(data);
    });
    server.on('data', (data) => {
      if (drop) {
        client.destroy();
        server.destroy();
      } else client.write(data);
    });
    client.on('error', () => server.destroy());
    server.on('error', () => client.destroy());
    client.on('close', () => {
      sockets.delete(client);
      server.destroy();
    });
    server.on('close', () => sockets.delete(server));
  });
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const address = proxy.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing proxy address.');
  const prefix = `test:reply-loss:${randomUUID()}:`;
  const engine = new BidService(ledger, {
    enabled: true,
    prefix,
    redisUrl: `redis://127.0.0.1:${address.port}`,
  });
  let recovered: BidService | undefined;
  try {
    await engine.start();
    const who = await buyer();
    const item = await lot();
    const proof = await engine.prepare(
      who,
      item.id,
      { maxKobo: 100000, idempotencyKey: randomUUID() },
      who.token,
      who.device,
    );
    await expect(
      engine.accept(item.id, proof, who.token, who.device),
    ).rejects.toThrow();
    expect(drop).toBe(true);
    expect((await ledger.balances(who.walletId)).heldKobo).toBe(
      BigInt(estimatedTotal(100000)),
    );
    recovered = new BidService(ledger, { enabled: true, prefix });
    await recovered.start();
    const result = await recovered.accept(
      item.id,
      proof,
      who.token,
      who.device,
    );
    expect(
      await recovered.accept(item.id, proof, who.token, who.device),
    ).toEqual(result);
    await recovered.maintain();
    expect((await ledger.balances(who.walletId)).heldKobo).toBe(
      BigInt(estimatedTotal(100000)),
    );
  } finally {
    await engine.close();
    await recovered?.close();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  }
});
it('supports the typed mobile/web bid API and fences logout before rejecting a pending confirmation', async () => {
  const oldToken = process.env.BID_MAINTENANCE_TOKEN;
  process.env.BID_MAINTENANCE_TOKEN = randomBytes(32).toString('hex');
  let worker: Awaited<ReturnType<typeof startBidWorker>> | undefined;
  const codes = new Map<string, string>();
  const app = await createApi({
    databaseUrl: process.env.BID_TEST_DATABASE_URL,
    mode: 'local',
    emailProvider: {
      async sendCode(email, code) {
        codes.set(email, code);
      },
    },
    bidOptions: { enabled: true, prefix: `test:http:${randomUUID()}:` },
  });
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const redis = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
    worker = await startBidWorker(
      {
        host: redis.hostname,
        port: Number(redis.port || 6379),
        db: Number(redis.pathname.slice(1) || 0),
      },
      {
        apiUrl: base,
        token: process.env.BID_MAINTENANCE_TOKEN,
        queueName: `test-bid-maintenance-${randomUUID()}`,
      },
    );
    const deviceId = randomUUID();
    const email = `bid-http-${randomUUID()}@example.test`;
    const phone = `+234${randomInt(1000000000, 9999999999)}`;
    const user = await ledger.db.user.create({
      data: {
        name: 'Verified fixture',
        emailHash: hashPii(email, 'email'),
        emailCiphertext: encryptPii(email, 'email'),
        phoneHash: hashPii(phone, 'phone'),
        phoneCiphertext: encryptPii(phone, 'phone'),
        phoneVerifiedAt: new Date(),
      },
    });
    const wallet = await ledger.openWallet(user.id);
    await ledger.topup({
      walletId: wallet.id,
      amountKobo: 10000000n,
      idempotencyKey: randomUUID(),
      reference: randomUUID(),
    });
    const auth = createAuthClient(base, { client: 'mobile', deviceId });
    const challenge = await auth.requestCode(email);
    const code = codes.get(email);
    if (!code) throw new Error('Missing fixture code.');
    const session = await auth.verifyCode(challenge.challengeId, code);
    const client = createBidClient(base, {
      accessToken: session.accessToken,
      deviceId,
    });
    const item = await lot();
    const proof = await client.prepare(item.id, {
      maxKobo: 100000,
      idempotencyKey: randomUUID(),
    });
    const result = await client.confirm(item.id, proof);
    expect(result.isLeader).toBe(true);
    expect(proof.mode).toBe('direct');
    expect(result.mode).toBe('direct');
    expect(result.currentPriceKobo).toBe(100000);
    expect(result).not.toHaveProperty('leader');
    expect(result).not.toHaveProperty('maxKobo');
    const other = await lot();
    const pending = await client.prepare(other.id, {
      maxKobo: 100000,
      mode: 'automatic',
      idempotencyKey: randomUUID(),
    });
    expect(pending.mode).toBe('automatic');
    await auth.logout(session.refreshToken);
    await expect(client.confirm(other.id, pending)).rejects.toMatchObject({
      status: 409,
    });
    const deadline = Date.now() + 8000;
    while (
      (await ledger.balances(wallet.id)).heldKobo !==
        BigInt(estimatedTotal(100000)) &&
      Date.now() < deadline
    )
      await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await ledger.balances(wallet.id)).heldKobo).toBe(
      BigInt(estimatedTotal(100000)),
    );
    const spec = (await (await fetch(`${base}/docs-json`)).json()) as {
      paths: Record<string, unknown>;
    };
    expect(spec.paths['/lots/{id}/bids']).toBeDefined();
    expect(spec.paths['/lots/{id}/bid-preparations']).toBeDefined();
    expect(spec.paths['/internal/bids/maintain']).toBeUndefined();
    const bad = await fetch(`${base}/lots/${item.id}/bids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preparationId: proof.preparationId,
        idempotencyKey: proof.idempotencyKey,
        amountKobo: 1,
      }),
    });
    expect(bad.status).toBe(400);
  } finally {
    await worker?.close();
    await app.close();
    if (oldToken === undefined) delete process.env.BID_MAINTENANCE_TOKEN;
    else process.env.BID_MAINTENANCE_TOKEN = oldToken;
  }
});
