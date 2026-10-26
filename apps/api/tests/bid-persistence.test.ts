import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { LedgerService } from '../src/ledger/ledger-service';
import { BidService } from '../src/bids/bid-service';
import { encryptPii, hashPii } from '../src/security/pii';
import { createApi } from '../src/app';

const require = createRequire(import.meta.url);
const { createClient } = require('redis') as typeof import('redis');
const redis = createClient({ url: process.env.REDIS_URL });
const prefix = `test:persist:${randomUUID()}:`;
let ledger: LedgerService;
let bids: BidService;
let categoryId: string;
let locationId: string;
beforeAll(async () => {
  const url = process.env.BID_TEST_DATABASE_URL;
  if (!url || !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
    throw new Error('Isolated database required.');
  ledger = new LedgerService(url);
  bids = new BidService(ledger, {
    enabled: true,
    prefix,
    redisUrl: process.env.REDIS_URL,
  });
  await bids.start();
  redis.on('error', () => {});
  await redis.connect();
  categoryId = (
    await ledger.db.category.create({
      data: { name: 'Test', slug: randomUUID() },
    })
  ).id;
  locationId = (
    await ledger.db.location.create({
      data: {
        code: randomUUID().slice(0, 30),
        name: 'Lagos',
        address: 'Synthetic test hub',
        hours: {},
        capacityPerSlot: 10,
      },
    })
  ).id;
});
afterAll(async () => {
  await redis.quit();
  await bids.close();
  await ledger.close();
});
async function accepted(mode: 'direct' | 'automatic' = 'direct') {
  const phone = `+234${randomInt(1000000000, 9999999999)}`;
  const email = `${randomUUID()}@example.test`;
  const user = await ledger.db.user.create({
    data: {
      name: 'Synthetic bidder',
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
      phoneHash: hashPii(phone, 'phone'),
      phoneCiphertext: encryptPii(phone, 'phone'),
      phoneVerifiedAt: new Date(),
      emailVerifiedAt: new Date(),
    },
  });
  const wallet = await ledger.openWallet(user.id);
  await ledger.topup({
    walletId: wallet.id,
    amountKobo: 10000000n,
    reference: randomUUID(),
    idempotencyKey: randomUUID(),
  });
  const session = await ledger.db.authSession.create({
    data: {
      userId: user.id,
      familyId: randomUUID(),
      deviceHash: '0'.repeat(64),
      client: 'web',
      accessHash: randomBytes(32).toString('hex'),
      refreshHash: randomBytes(32).toString('hex'),
      accessExpiresAt: new Date(Date.now() + 900000),
      expiresAt: new Date(Date.now() + 900000),
    },
  });
  const lot = await ledger.db.lot.create({
    data: {
      lotNumber: randomUUID(),
      title: 'Synthetic kettle',
      description: 'Test',
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
  const who = { userId: user.id, sessionId: session.id };
  const token = randomUUID(),
    device = randomUUID();
  const proof = await bids.prepare(
    who,
    lot.id,
    { maxKobo: 1000000, mode, idempotencyKey: randomUUID() },
    token,
    device,
  );
  const result = await bids.accept(lot.id, proof, token, device);
  return { proof, result, wallet, lot, who, token, device };
}
it('persists exact receipts and bid rows once under concurrent replay without moving wallet funds', async () => {
  const fixture = await accepted();
  const before = await ledger.balances(fixture.wallet.id);
  await Promise.all(
    Array.from({ length: 10 }, () => bids.persist([fixture.result.streamId])),
  );
  expect(
    await ledger.db.bidAcceptance.count({
      where: { id: fixture.proof.preparationId },
    }),
  ).toBe(1);
  const rows = await ledger.db.bid.findMany({
    where: { acceptanceId: fixture.proof.preparationId },
  });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    userId: fixture.who.userId,
    amountKobo: 1000000n,
    maxKobo: 1000000n,
    isProxy: false,
  });
  expect(await ledger.balances(fixture.wallet.id)).toEqual(before);
  await expect(
    ledger.db.bidAcceptance.update({
      where: { id: fixture.proof.preparationId },
      data: { fingerprint: '0'.repeat(64) },
    }),
  ).rejects.toThrow();
  await expect(
    ledger.db.bid.update({
      where: { id: rows[0]?.id },
      data: { amountKobo: 50000n },
    }),
  ).rejects.toThrow();
});
it('rejects unknown stream entries and keeps a losing challenge separate from its automatic counterbid', async () => {
  await expect(bids.persist(['999999999999999-0'])).rejects.toThrow();
  const leader = await accepted('automatic');
  const challenger = await accepted();
  const proof = await bids.prepare(
    challenger.who,
    leader.lot.id,
    { maxKobo: 500000, idempotencyKey: randomUUID() },
    challenger.token,
    challenger.device,
  );
  const result = await bids.accept(
    leader.lot.id,
    proof,
    challenger.token,
    challenger.device,
  );
  await bids.persist([result.streamId]);
  const rows = await ledger.db.bid.findMany({
    where: { acceptanceId: proof.preparationId },
    orderBy: { role: 'desc' },
  });
  expect(rows).toHaveLength(2);
  expect(rows.find((row) => row.role === 'request')).toMatchObject({
    userId: challenger.who.userId,
    amountKobo: 500000n,
    maxKobo: 500000n,
    isProxy: false,
  });
  expect(rows.find((row) => row.role === 'counter')).toMatchObject({
    userId: leader.who.userId,
    amountKobo: 510000n,
    maxKobo: 1000000n,
    isProxy: true,
  });
});
async function until(check: () => Promise<boolean>, ms = 20000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Recovery condition was not reached.');
}
it.each(['before-commit', 'after-commit'] as const)(
  'survives a real worker kill %s and recovers pending events without losses or duplicates',
  async (phase) => {
    const token = randomBytes(32).toString('hex');
    const oldToken = process.env.BID_MAINTENANCE_TOKEN;
    process.env.BID_MAINTENANCE_TOKEN = token;
    const app = await createApi({
      databaseUrl: process.env.BID_TEST_DATABASE_URL,
      bidOptions: { enabled: true, prefix, redisUrl: process.env.REDIS_URL },
    });
    await app.listen(0, '127.0.0.1');
    const api = await app.getUrl();
    if (phase === 'before-commit') {
      const denied = await fetch(`${api}/internal/bids/persist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"streamIds":[]}',
      });
      expect(denied.status).toBe(401);
      const invalid = await fetch(`${api}/internal/bids/persist`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{"streamIds":[],"namespace":"forged"}',
      });
      expect(invalid.status).toBe(400);
    }
    let blocked = true,
      reached = false;
    const proxy = createServer(async (request, response) => {
      let body = '';
      for await (const chunk of request) body += String(chunk);
      const input = JSON.parse(body) as { streamIds: string[] };
      if (blocked && input.streamIds.length && phase === 'before-commit') {
        reached = true;
        return;
      }
      const result = await fetch(`${api}/internal/bids/persist`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body,
      });
      const payload = await result.text();
      if (blocked && input.streamIds.length && phase === 'after-commit') {
        reached = true;
        return;
      }
      response.writeHead(result.status, { 'Content-Type': 'application/json' });
      response.end(payload);
    });
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const address = proxy.address();
    if (!address || typeof address === 'string')
      throw new Error('No proxy port.');
    const queueName = `test-persist-${randomUUID()}`;
    let child: ChildProcess | undefined;
    const launch = () =>
      spawn(
        process.execPath,
        [
          '--import',
          pathToFileURL(require.resolve('tsx')).href,
          'apps/api/tests/fixtures/persistence-worker.ts',
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            TEST_BID_PREFIX: prefix,
            TEST_BID_QUEUE: queueName,
            INTERNAL_API_URL: `http://127.0.0.1:${address.port}`,
            BID_MAINTENANCE_TOKEN: token,
          },
          stdio: 'ignore',
        },
      );
    try {
      const fixtures: Awaited<ReturnType<typeof accepted>>[] = [];
      for (let i = 0; i < 8; i++)
        fixtures.push(await accepted(i % 2 ? 'direct' : 'automatic'));
      child = launch();
      await until(async () => reached);
      expect(
        await ledger.db.bidAcceptance.count({
          where: { id: { in: fixtures.map((f) => f.proof.preparationId) } },
        }),
      ).toBe(phase === 'after-commit' ? fixtures.length : 0);
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
      blocked = false;
      proxy.closeAllConnections();
      child = launch();
      await until(async () => {
        const count = await ledger.db.bidAcceptance.count({
          where: { id: { in: fixtures.map((f) => f.proof.preparationId) } },
        });
        const pending = await redis.xPending(
          `${prefix}accepted`,
          'postgres-v1',
        );
        return count === fixtures.length && pending.pending === 0;
      });
      expect(
        await ledger.db.bid.count({
          where: {
            acceptanceId: { in: fixtures.map((f) => f.proof.preparationId) },
          },
        }),
      ).toBe(fixtures.length);
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        child.kill('SIGKILL');
        await exited;
      }
      proxy.closeAllConnections();
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
      await app.close();
      if (oldToken === undefined) delete process.env.BID_MAINTENANCE_TOKEN;
      else process.env.BID_MAINTENANCE_TOKEN = oldToken;
    }
  },
  60000,
);
it('rejects a forged stream entry without partially persisting its batch', async () => {
  const fixture = await accepted();
  const original = (
    await redis.xRange(
      `${prefix}accepted`,
      fixture.result.streamId,
      fixture.result.streamId,
    )
  )[0];
  if (!original) throw new Error('Missing accepted fixture.');
  const forgedId = await redis.xAdd(`${prefix}accepted`, '*', {
    ...original.message,
    userId: randomUUID(),
  });
  await expect(
    bids.persist([fixture.result.streamId, forgedId]),
  ).rejects.toThrow();
  expect(
    await ledger.db.bidAcceptance.count({
      where: { id: fixture.proof.preparationId },
    }),
  ).toBe(0);
});
