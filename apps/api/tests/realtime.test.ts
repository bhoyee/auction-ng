import { expect, it } from 'vitest';
import { randomUUID, randomInt } from 'node:crypto';
import { createApi } from '../src/app';
import { LedgerService } from '../src/ledger/ledger-service';
import { encryptPii, hashPii } from '../src/security/pii';
import { createAuthClient } from '../../../packages/api-client/src/auth';
import { createBidClient } from '../../../packages/api-client/src/bids';
import { createRealtimeClient } from '../../../packages/api-client/src/realtime';
import { createRealtime } from '../../realtime/src/server';

it('authenticates real buyers, projects actual Lua bids privately and fences logout before the next update', async () => {
  const url = process.env.BID_TEST_DATABASE_URL;
  if (!url || !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
    throw new Error('Isolated database required.');
  const ledger = new LedgerService(url);
  const namespace = `test:gateway-api:${randomUUID()}:`;
  const codes = new Map<string, string>();
  const app = await createApi({
    databaseUrl: url,
    mode: 'local',
    emailProvider: {
      async sendCode(email, code) {
        codes.set(email, code);
      },
    },
    bidOptions: { enabled: true, prefix: namespace },
  });
  await app.listen(0, '127.0.0.1');
  const api = await app.getUrl();
  const gateway = await createRealtime(
    process.env.REDIS_URL ?? 'redis://localhost:6379',
    { namespace, apiUrl: api },
  );
  await new Promise<void>((resolve) =>
    gateway.http.listen(0, '127.0.0.1', resolve),
  );
  const address = gateway.http.address();
  if (!address || typeof address === 'string')
    throw new Error('No gateway port');
  const realtimeBase = `http://127.0.0.1:${address.port}`;
  const clients: ReturnType<typeof createRealtimeClient>[] = [];
  async function buyer() {
    const email = `realtime-${randomUUID()}@example.test`,
      phone = `+234${randomInt(1000000000, 9999999999)}`;
    const user = await ledger.db.user.create({
      data: {
        name: 'Synthetic buyer',
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
    const deviceId = randomUUID();
    const auth = createAuthClient(api, { client: 'mobile', deviceId });
    const challenge = await auth.requestCode(email);
    const code = codes.get(email);
    if (!code) throw new Error('No fixture code');
    const session = await auth.verifyCode(challenge.challengeId, code);
    const bid = createBidClient(api, {
      accessToken: session.accessToken,
      deviceId,
    });
    const events: unknown[] = [];
    const live = createRealtimeClient(realtimeBase, {
      credentials: () => ({ accessToken: session.accessToken, deviceId }),
      onOutbid: (event) => events.push(event),
    });
    clients.push(live);
    return { user, auth, session, bid, live, events };
  }
  async function until(check: () => boolean) {
    const end = Date.now() + 10000;
    while (Date.now() < end) {
      if (check()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('Live state did not converge');
  }
  try {
    const a = await buyer(),
      b = await buyer();
    const category = await ledger.db.category.create({
      data: { name: 'Test', slug: randomUUID() },
    });
    const location = await ledger.db.location.create({
      data: {
        code: randomUUID().slice(0, 30),
        name: 'Lagos test',
        address: 'Synthetic hub',
        hours: {},
        capacityPerSlot: 10,
      },
    });
    const lot = await ledger.db.lot.create({
      data: {
        lotNumber: randomUUID(),
        title: 'Test kettle',
        description: 'Synthetic',
        condition: 'open_box',
        retailPriceKobo: 1000000n,
        startPriceKobo: 50000n,
        startAt: new Date(Date.now() - 1000),
        endAt: new Date(Date.now() + 300000),
        status: 'open',
        categoryId: category.id,
        locationId: location.id,
      },
    });
    const first = await a.bid.prepare(lot.id, {
      maxKobo: 1000000,
      mode: 'automatic',
      idempotencyKey: randomUUID(),
    });
    await a.bid.confirm(lot.id, first);
    a.live.watchLot(lot.id);
    b.live.watchLot(lot.id);
    await until(
      () =>
        a.live.getSnapshot(lot.id).status === 'live' &&
        b.live.getSnapshot(lot.id).status === 'live',
    );
    expect(a.live.getSnapshot(lot.id).lot?.isLeader).toBe(true);
    expect(b.live.getSnapshot(lot.id).lot?.isLeader).toBe(false);
    const next = await b.bid.prepare(lot.id, {
      maxKobo: 1200000,
      idempotencyKey: randomUUID(),
    });
    await b.bid.confirm(lot.id, next);
    await b.bid.confirm(lot.id, next);
    await until(
      () =>
        a.events.length === 1 &&
        b.live.getSnapshot(lot.id).lot?.currentPriceKobo === 1200000,
    );
    expect(a.live.getSnapshot(lot.id).lot?.isLeader).toBe(false);
    expect(b.live.getSnapshot(lot.id).lot?.isLeader).toBe(true);
    expect(a.events).toHaveLength(1);
    expect(JSON.stringify(a.live.getSnapshot(lot.id))).not.toContain('maxKobo');
    expect(JSON.stringify(a.events)).not.toContain(b.user.id);
    await a.auth.logout(a.session.refreshToken);
    const raise = await b.bid.prepare(lot.id, {
      maxKobo: 1500000,
      idempotencyKey: randomUUID(),
    });
    await b.bid.confirm(lot.id, raise);
    await until(() => a.live.getSnapshot(lot.id).status === 'unauthenticated');
    expect(a.live.getSnapshot(lot.id).lot).toBeNull();
    const spec = (await (await fetch(`${api}/docs-json`)).json()) as {
      paths: Record<string, unknown>;
    };
    expect(spec.paths['/auth/realtime-session']).toBeDefined();
    expect(spec.paths['/lots/{id}/live-state']).toBeDefined();
  } finally {
    clients.forEach((client) => client.close());
    await gateway.close();
    await app.close();
    await ledger.close();
  }
}, 60000);
