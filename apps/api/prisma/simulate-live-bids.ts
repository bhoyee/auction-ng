import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { LedgerService } from '../src/ledger/ledger-service';
import { AuthService } from '../src/auth/auth-service';
import { BidService } from '../src/bids/bid-service';
import { hashPii } from '../src/security/pii';
import { assertDemoDatabase } from './demo-catalogue';

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  assertDemoDatabase(url, process.env.NODE_ENV);
  const name = new URL(url).pathname.slice(1),
    namespace = process.env.BID_NAMESPACE;
  if (
    process.env.DEPLOYMENT_ENV !== 'local' ||
    namespace !== `auction:demo:${name}:`
  )
    throw Error('Dedicated local demo namespace required.');
  const entries = process.argv.slice(2).map((arg) => {
    const match = /^--([a-z-]+)=(\d+)$/.exec(arg);
    if (!match) throw Error('Use --count=40 --per-minute=120');
    return [match[1], match[2]];
  });
  const options = z
    .object({
      count: z.coerce.number().int().min(1).max(4000).default(40),
      'per-minute': z.coerce.number().int().min(1).max(400).default(120),
    })
    .strict()
    .parse(Object.fromEntries(entries));
  const ledger = new LedgerService(url),
    codes = new Map<string, string>();
  const auth = new AuthService({
    databaseUrl: url,
    mode: 'local',
    emailProvider: {
      sendCode: async (email, code) => {
        if (!/^demo-live-buyer-\d+@example\.test$/.test(email))
          throw Error('Synthetic recipients only.');
        codes.set(email, code);
      },
    },
  });
  const bids = new BidService(ledger, { enabled: true, prefix: namespace });
  try {
    const buyers: {
      userId: string;
      sessionId: string;
      accessToken: string;
      deviceId: string;
      ip: string;
    }[] = [];
    for (let index = 1; index <= 20; index++) {
      const email = `demo-live-buyer-${index}@example.test`;
      const user = await ledger.db.user.findUnique({
        where: {
          emailHash: hashPii(email, 'email'),
        },
        select: {
          id: true,
          role: true,
          status: true,
          archivedAt: true,
          authenticatorEnabled: true,
        },
      });
      if (
        user &&
        (user.role !== 'buyer' ||
          user.status !== 'active' ||
          user.archivedAt ||
          user.authenticatorEnabled)
      )
        continue;
      const deviceId = randomUUID(),
        ip = 'live-demo-client-' + index;
      try {
        const challenge = await auth.requestCode(
          user
            ? {
                email,
                password: 'Demo fixture password 42',
                purpose: 'login',
                deviceId,
                client: 'web',
              }
            : {
                email,
                password: 'Demo fixture password 42',
                purpose: 'signup',
                name: 'Live monitor fixture ' + index,
                deviceId,
                client: 'web',
              },
          ip,
        );
        const code = codes.get(email);
        if (!code) throw Error('Synthetic verification code unavailable.');
        const session = await auth.verifyCode(
          { challengeId: challenge.challengeId, code, deviceId, client: 'web' },
          ip,
        );
        codes.delete(email);
        const identity = await auth.authenticate(session.accessToken, deviceId);
        const wallet = await ledger.openWallet(identity.user.id);
        const funding = 'demo:live:fixture-fund:' + identity.user.id;
        // Stable funding receipts apply only to these dedicated synthetic users.
        await ledger.topup({
          walletId: wallet.id,
          amountKobo: 1000000000n,
          idempotencyKey: funding,
          reference: funding,
        });
        buyers.push({
          userId: identity.user.id,
          sessionId: identity.sessionId,
          accessToken: session.accessToken,
          deviceId,
          ip,
        });
      } catch {
        codes.delete(email);
      }
    }
    if (!buyers.length) throw Error('No eligible synthetic fixture buyers.');
    const lots = await ledger.db.lot.findMany({
      where: {
        description: { startsWith: 'Live monitor demonstration.' },
        status: 'open',
        endAt: { gt: new Date() },
      },
      select: { id: true, startPriceKobo: true },
      orderBy: { endAt: 'asc' },
      take: 20,
    });
    if (!lots.length) throw Error('Run the live demo seed first.');
    await bids.start();
    let accepted = 0,
      rejected = 0;
    const streams: string[] = [],
      start = performance.now();
    const confirmations: number[] = [];
    for (let index = 0; index < options.count; index++) {
      const buyer =
          buyers[(index + Math.floor(index / lots.length)) % buyers.length],
        lot = lots[index % lots.length];
      if (!buyer || !lot) throw Error('Synthetic bidder unavailable.');
      let preparationId: string | undefined;
      try {
        const snapshot = await bids.snapshot(null, lot.id),
          key = randomUUID();
        const amount =
          (snapshot.currentPriceKobo ?? Number(lot.startPriceKobo)) + 10000;
        await auth.limitBidPreparations(buyer.userId, buyer.ip);
        const preparation = await bids.prepare(
          { userId: buyer.userId, sessionId: buyer.sessionId },
          lot.id,
          { maxKobo: amount, mode: 'direct', idempotencyKey: key },
          buyer.accessToken,
          buyer.deviceId,
        );
        preparationId = preparation.preparationId;
        const sent = performance.now();
        const result = await bids.accept(
          lot.id,
          { preparationId, idempotencyKey: key },
          buyer.accessToken,
          buyer.deviceId,
          buyer.ip,
        );
        confirmations.push(performance.now() - sent);
        streams.push(result.streamId);
        accepted++;
      } catch {
        rejected++;
        if (preparationId)
          await bids
            .cancel(
              { userId: buyer.userId, sessionId: buyer.sessionId },
              preparationId,
            )
            .catch(() => {});
      }
      if ((index + 1) % 10 === 0)
        console.log(
          `Attempted ${index + 1}; accepted ${accepted}; rejected ${rejected}.`,
        );
      if (index + 1 < options.count)
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.max(
              0,
              start +
                ((index + 1) * 60000) / options['per-minute'] -
                performance.now(),
            ),
          ),
        );
    }
    for (let offset = 0; offset < streams.length; offset += 50)
      await bids.persist(streams.slice(offset, offset + 50));
    console.log(
      `Simulation finished: ${accepted} accepted bids, ${rejected} rejected. Normal reservations and settlements remain active. Dedicated synthetic wallet funding uses stable, one-time ledger receipts.`,
    );
    confirmations.sort((a, b) => a - b);
    const p95 =
      confirmations[Math.max(0, Math.ceil(confirmations.length * 0.95) - 1)];
    if (p95 !== undefined)
      console.log(
        `Local confirmation p95: ${p95.toFixed(2)} ms (${confirmations.length} samples).`,
      );
    if (!accepted)
      throw Error(
        'No bids accepted; check synthetic wallet availability and engine readiness.',
      );
  } finally {
    codes.clear();
    await bids.close();
    await auth.close();
    await ledger.close();
  }
}
main().catch(() => {
  console.error(
    'Live bid simulator stopped. Check local demo isolation, engine readiness and synthetic buyer funds. No credentials are logged.',
  );
  process.exitCode = 1;
});
