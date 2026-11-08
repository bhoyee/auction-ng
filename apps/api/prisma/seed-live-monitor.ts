import { createHash, randomUUID } from 'node:crypto';
import { LedgerService } from '../src/ledger/ledger-service';
import { assertDemoDatabase, liveMonitorDemoPlan } from './demo-catalogue';
let stage = 'validating local demo isolation';

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  assertDemoDatabase(url, process.env.NODE_ENV);
  const name = new URL(url).pathname.slice(1);
  if (
    process.env.DEPLOYMENT_ENV !== 'local' ||
    process.env.BID_NAMESPACE !== `auction:demo:${name}:`
  )
    throw Error('Dedicated local demo namespace required.');
  const ledger = new LedgerService(url);
  try {
    stage = 'reading licensed source photos';
    const source = await ledger.db.lot.findMany({
      where: {
        description: { startsWith: 'Demo only:' },
        images: { some: { thumbnailUrl: { not: null } } },
      },
      include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
      take: 100,
      orderBy: { id: 'asc' },
    });
    const photos = [
      ...new Map(
        source.map((row) => [row.images[0]?.thumbnailUrl, row]),
      ).values(),
    ].slice(0, 20);
    if (photos.length < 12)
      throw Error('Seed the licensed marketplace demo first.');
    const batch = process.argv.includes('--new-batch')
      ? randomUUID()
      : 'initial-live-monitor-v1';
    let created = 0;
    stage = 'creating append-only demonstration lots';
    for (const [index, plan] of liveMonitorDemoPlan(new Date()).entries()) {
      const original = photos[index % photos.length];
      if (!original) throw Error('Demo photo unavailable.');
      const digest = createHash('sha256')
        .update(name + ':live:' + batch + ':' + index)
        .digest('hex');
      const id =
        digest.slice(0, 8) +
        '-' +
        digest.slice(8, 12) +
        '-4' +
        digest.slice(13, 16) +
        '-8' +
        digest.slice(17, 20) +
        '-' +
        digest.slice(20, 32);
      if (
        await ledger.db.lot.findUnique({ where: { id }, select: { id: true } })
      )
        continue;
      await ledger.db.lot.create({
        data: {
          id,
          title: original.title,
          description:
            'Live monitor demonstration. Synthetic inventory, representative licensed photo and test funds only.',
          condition: original.condition,
          categoryId: original.categoryId,
          locationId: original.locationId,
          startPriceKobo: original.startPriceKobo,
          retailPriceKobo: original.retailPriceKobo,
          startAt: plan.startAt,
          endAt: plan.endAt,
          status: 'open',
          autoRelistEnabled: false,
          images: {
            create: original.images.map((image) => ({
              url: image.url,
              thumbnailUrl: image.thumbnailUrl,
              sortOrder: image.sortOrder,
              width: image.width,
              height: image.height,
              thumbnailBytes: image.thumbnailBytes,
            })),
          },
        },
      });
      created++;
    }
    console.log(
      `Created ${created} new demo lots with 12–72 hour original run times. Existing listings, bids and wallets were not changed.`,
    );
  } finally {
    await ledger.close();
  }
}
main().catch((error: unknown) => {
  const code =
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^[A-Z0-9]{3,8}$/.test(error.code)
      ? error.code
      : 'unavailable';
  console.error(`Demo seed stage: ${stage}; error code: ${code}.`);

  console.error(
    'Live demo seed stopped. Use the isolated local demo database and namespace; no existing data is reset.',
  );
  process.exitCode = 1;
});
