import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import { LedgerService } from '../src/ledger/ledger-service';
import { AuthService } from '../src/auth/auth-service';
import { BidService } from '../src/bids/bid-service';
import { MeilisearchEngine } from '../src/search/meilisearch-engine';
import { encryptPii, hashPii } from '../src/security/pii';
import { databaseValues, minNextBid } from '@auction-ng/shared';
import { assertDemoDatabase, demoLotPlan } from './demo-catalogue';

let stage = 'validating demo isolation';
async function main() {
  const connection = process.env.DATABASE_URL ?? '';
  assertDemoDatabase(connection, process.env.NODE_ENV);
  const namespace = process.env.BID_NAMESPACE;
  if (
    !namespace?.startsWith(
      `auction:demo:${new URL(connection).pathname.slice(1)}:`,
    )
  )
    throw new Error('A dedicated demo Redis namespace is required.');
  stage = 'reading licensed demo images';
  const photos = z
    .array(
      z
        .object({
          key: z.string().regex(/^[a-z]+$/),
          product: z.string(),
          id: z.number(),
          author: z.string(),
          source: z.url(),
          downloadUrl: z.url().optional(),
          license: z.enum(['Pexels', 'Unsplash']).optional(),
        })
        .strict(),
    )
    .length(12)
    .parse(
      JSON.parse(
        await readFile(resolve('apps/web/public/demo/photos.json'), 'utf8'),
      ),
    );
  const names = [
    'Electronics',
    'Phones and accessories',
    'Computers',
    'Home appliances',
    'Kitchen',
    'Furniture',
    'Fashion',
    'Beauty',
    'Tools',
    'Baby and children',
    'Sports',
    'Office',
  ];
  const ledger = new LedgerService(connection);
  const codes = new Map<string, string>();
  const auth = new AuthService({
    databaseUrl: connection,
    mode: 'local',
    emailProvider: {
      async sendCode(email, code) {
        codes.set(email, code);
      },
    },
  });
  const bids = new BidService(ledger, {
    enabled: true,
    prefix: namespace,
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  });
  try {
    if ((await ledger.db.lot.count()) || (await ledger.db.user.count()))
      throw new Error(
        'Demo setup requires a fresh database and never overwrites existing data.',
      );
    stage = 'creating demo pickup locations';
    const hubs = await Promise.all(
      ['Ikeja, Lagos', 'Lekki, Lagos', 'Wuse, Abuja'].map((name, index) =>
        ledger.db.location.create({
          data: {
            name: `Demo pickup · ${name}`,
            code: `DEMO-HUB-${index}`,
            address: 'Demonstration location only; no real pickup available.',
            hours: { mondayToSaturday: '09:00–17:00', demonstration: true },
            capacityPerSlot: 30,
          },
        }),
      ),
    );
    stage = 'creating twelve categories';
    const categories = await Promise.all(
      names.map((name, index) =>
        ledger.db.category.create({
          data: { name, slug: `demo-${photos[index]?.key ?? index}` },
        }),
      ),
    );
    stage = 'creating photographed open lots';
    const plan = demoLotPlan(new Date());
    const lots = [];
    for (const [index, input] of plan.entries()) {
      const photo = photos[input.category];
      const category = categories[input.category];
      const hub = hubs[index % hubs.length];
      if (!photo || !category || !hub)
        throw new Error('Incomplete demo catalogue.');
      const imageBytes = (
        await readFile(resolve(`apps/web/public/demo/${photo.key}-thumb.webp`))
      ).length;
      const lot = await ledger.db.lot.create({
        data: {
          title: photo.product,
          lotNumber: `DEMO-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
          description:
            'Demo only: this is a synthetic auction, not an offer of real goods. The licensed product photo is representative. The sample condition describes demonstration inventory only. Review fees before bidding; sample pickup is available after a test settlement.',
          categoryId: category.id,
          locationId: hub.id,
          status: 'open',
          condition:
            databaseValues.lotConditions[
              index % databaseValues.lotConditions.length
            ] ?? 'open_box',
          startPriceKobo: BigInt(input.startPriceKobo),
          retailPriceKobo: BigInt(input.retailPriceKobo),
          startAt: input.startAt,
          endAt: input.endAt,
          images: {
            create: {
              url: `https://demo.auction.invalid/demo/${photo.key}-display.webp`,
              thumbnailUrl: `https://demo.auction.invalid/demo/${photo.key}-thumb.webp`,
              sortOrder: 0,
              width: 960,
              height: 720,
              thumbnailBytes: imageBytes,
            },
          },
        },
      });
      lots.push(lot);
    }
    stage = 'starting the isolated bid engine';
    await bids.start();
    stage = 'creating synthetic buyers and ledger funds';
    const buyers = [];
    for (let index = 0; index < 12; index++) {
      const email = `demo-buyer-${index + 1}@example.test`;
      const deviceId = randomUUID();
      // Create synthetic eligibility before issuing any sessions; never bypass
      // the fence required to change eligibility on an existing account.
      await ledger.db.user.create({
        data: {
          name:
            ['Chiamaka Okafor', 'Tunde Adeyemi', 'Halima Musa', 'Emeka Obi'][
              index % 4
            ] ?? 'Demo buyer',
          emailHash: hashPii(email, 'email'),
          emailCiphertext: encryptPii(email, 'email'),
        },
      });
      const challenge = await auth.requestCode(
        { email, deviceId, client: 'web' },
        `demo-${index}`,
      );
      const code = codes.get(email);
      if (!code) throw new Error('Demo code unavailable.');
      const token = await auth.verifyCode(
        { challengeId: challenge.challengeId, code, deviceId, client: 'web' },
        `demo-${index}`,
      );
      codes.delete(email);
      const wallet = await ledger.openWallet(token.user.id);
      await ledger.topup({
        walletId: wallet.id,
        amountKobo: 1000000000n,
        idempotencyKey: randomUUID(),
        reference: `demo-only:${randomUUID()}`,
      });
      buyers.push({
        identity: await auth.authenticate(token.accessToken, deviceId),
        accessToken: token.accessToken,
        deviceId,
      });
    }
    stage = 'accepting funded demo bids';
    const streams = [];
    for (const [index, lot] of lots.entries()) {
      await bids.loadLot(lot.id);
      const buyer = buyers[index % buyers.length];
      if (!buyer) throw new Error('Missing demo buyer.');
      await ledger.db.watchlist.createMany({
        data: buyers
          .slice(0, 1 + (index % 5))
          .map((value) => ({ userId: value.identity.user.id, lotId: lot.id })),
        skipDuplicates: true,
      });
      if (index % 3 !== 0) continue;
      let price: number | null = null;
      for (let turn = 0; turn < (index < 12 ? 3 : 1); turn++) {
        const bidder = buyers[(index + turn) % buyers.length];
        if (!bidder) throw new Error('Missing demo bidder.');
        const key = randomUUID();
        const amount = minNextBid(Number(lot.startPriceKobo), price);
        const prepared = await bids.prepare(
          {
            userId: bidder.identity.user.id,
            sessionId: bidder.identity.sessionId,
          },
          lot.id,
          { maxKobo: amount, mode: 'direct', idempotencyKey: key },
          bidder.accessToken,
          bidder.deviceId,
        );
        const accepted = await bids.accept(
          lot.id,
          { preparationId: prepared.preparationId, idempotencyKey: key },
          bidder.accessToken,
          bidder.deviceId,
        );
        streams.push(accepted.streamId);
        price = accepted.currentPriceKobo;
      }
    }
    stage = 'persisting accepted bid receipts';
    await bids.persist(streams);
    await bids.maintain();
    stage = 'indexing the isolated demo catalogue';
    if (process.env.MEILI_MASTER_KEY) {
      const engine = new MeilisearchEngine(
        process.env.MEILISEARCH_URL ?? 'http://localhost:7700',
        process.env.MEILI_MASTER_KEY,
        process.env.MEILISEARCH_INDEX,
      );
      await engine.initialize();
      await engine.upsert(
        lots.map((lot) => ({
          id: lot.id,
          lotNumber: lot.lotNumber,
          title: lot.title,
          description: lot.description,
          categoryId: lot.categoryId,
          locationId: lot.locationId,
          startPriceKobo: Number(lot.startPriceKobo),
          endAtMs: lot.endAt.getTime(),
        })),
      );
    }
    console.log(
      'Demo acceptance: 120 open lots, 12 photographed categories, 48 accepted bids and real watchlists in isolated storage.',
    );
  } finally {
    await bids.close();
    await auth.close();
    await ledger.close();
  }
}
main().catch((error: unknown) => {
  console.error(
    `Demo stage: ${stage}; error type: ${error instanceof Error ? error.constructor.name : 'unknown'}.`,
  );
  console.error(
    'Marketplace demo seed failed. Check local services, image files and private configuration. Existing data was not reset.',
  );
  process.exitCode = 1;
});
