import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createApi } from '../src/app';
import { CatalogueService } from '../src/catalogue/catalogue-service';
import { createCatalogueClient } from '../../../packages/api-client/src/catalogue';

let app: Awaited<ReturnType<typeof createApi>>;
let service: CatalogueService;
let baseUrl: string;
const categoryId = randomUUID();
const locationId = randomUUID();
const queries: string[] = [];
beforeAll(async () => {
  const databaseUrl = process.env.LEDGER_TEST_DATABASE_URL;
  if (
    process.env.NODE_ENV !== 'test' ||
    !databaseUrl ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(databaseUrl).pathname)
  )
    throw new Error('Isolated performance database required.');
  app = await createApi({ databaseUrl, mode: 'local' });
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
  service = app.get(CatalogueService);
  service.db.$on('query', (event) => queries.push(event.query));
  await service.db.category.create({
    data: {
      id: categoryId,
      name: 'Performance fixtures',
      slug: `performance-${randomUUID()}`,
    },
  });
  await service.db.location.create({
    data: {
      id: locationId,
      code: randomUUID().replaceAll('-', ''),
      name: 'Synthetic performance hub',
      address: 'Synthetic test location',
      hours: {},
      capacityPerSlot: 20,
    },
  });
  const ids = Array.from({ length: 60 }, () => randomUUID());
  await service.db.lot.createMany({
    data: ids.map((id) => ({
      id,
      lotNumber: `PERF-${id.slice(0, 28)}`,
      title: 'Synthetic phone',
      description: 'Performance test only',
      condition: 'open_box',
      retailPriceKobo: 5000000n,
      startPriceKobo: 50000n,
      categoryId,
      locationId,
      startAt: new Date(Date.now() + 3600000),
      endAt: new Date(Date.now() + 7200000),
      status: 'scheduled',
    })),
  });
  await service.db.lotImage.createMany({
    data: ids.map((id) => ({
      lotId: id,
      url: `https://photos.example.test/${id}/960.webp`,
      thumbnailUrl: `https://photos.example.test/${id}/320.webp`,
      sortOrder: 0,
      width: 960,
      height: 640,
      thumbnailBytes: 20000,
    })),
  });
});
afterAll(async () => {
  await app?.close();
});
it('serves 50 lots below 100 ms with four SQL queries for either one or 50 lots', async () => {
  const client = createCatalogueClient(baseUrl);
  await client.list({ categoryId, limit: 50 });
  queries.length = 0;
  await client.list({ categoryId, limit: 1 });
  expect(queries).toHaveLength(4);
  const times: number[] = [];
  for (let i = 0; i < 10; i++) {
    queries.length = 0;
    const start = performance.now();
    const page = await client.list({ categoryId, limit: 50 });
    times.push(performance.now() - start);
    expect(page.items).toHaveLength(50);
    expect(queries).toHaveLength(4);
  }
  const p95 = times.sort((a, b) => a - b)[9] ?? Infinity;
  console.log(
    `Catalogue 50-lot HTTP p95: ${p95.toFixed(1)} ms; fixed SQL queries: 4.`,
  );
  expect(p95).toBeLessThan(100);
});
