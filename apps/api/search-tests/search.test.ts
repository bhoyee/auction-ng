import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createApi } from '../src/app';
import { CatalogueService } from '../src/catalogue/catalogue-service';
import { SearchService } from '../src/search/search-service';
import {
  MeilisearchEngine,
  type SearchDocument,
  type SearchEngine,
} from '../src/search/meilisearch-engine';
import { createSearchClient } from '../../../packages/api-client/src/search';
import { searchInputSchema, searchQuerySchema } from '@auction-ng/shared';
import { startSearchWorker } from '../../worker/src/search-worker';
import { ServiceUnavailableException } from '@nestjs/common';

let app: Awaited<ReturnType<typeof createApi>>;
let catalogue: CatalogueService;
let search: SearchService;
let engine: MeilisearchEngine;
let baseUrl: string;
const categoryId = randomUUID();
const locationId = randomUUID();
const index = `auction_ng_test_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
const phoneIds = Array.from({ length: 61 }, () => randomUUID());
const endAt = new Date(Date.now() + 1800000);
const meiliUrl = process.env.MEILISEARCH_URL ?? 'http://localhost:7700';
const meiliKey = process.env.MEILI_MASTER_KEY;
beforeAll(async () => {
  const databaseUrl = process.env.SEARCH_TEST_DATABASE_URL;
  if (
    process.env.NODE_ENV !== 'test' ||
    !databaseUrl ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(databaseUrl).pathname) ||
    !['localhost', '127.0.0.1'].includes(new URL(meiliUrl).hostname) ||
    !meiliKey
  )
    throw new Error('Isolated search database and local Meilisearch required.');
  engine = new MeilisearchEngine(meiliUrl, meiliKey, index);
  app = await createApi({ databaseUrl, mode: 'local', searchEngine: engine });
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
  catalogue = app.get(CatalogueService);
  search = app.get(SearchService);
  await catalogue.db.category.create({
    data: { id: categoryId, name: 'Phones', slug: `phones-${randomUUID()}` },
  });
  await catalogue.db.location.create({
    data: {
      id: locationId,
      code: randomUUID().replaceAll('-', ''),
      name: 'Synthetic search hub',
      address: 'Synthetic location',
      hours: {},
      capacityPerSlot: 20,
    },
  });
  await catalogue.db.lot.createMany({
    data: phoneIds.map((id, i) => ({
      ...lotData('Apple iPhone 13', `PHONE-${i}`),
      id,
      startPriceKobo: BigInt(50000 + i * 1000),
    })),
  });
  await drain();
}, 15000);
afterAll(async () => {
  await app?.close();
});
function lotData(title: string, suffix = randomUUID().slice(0, 20)) {
  return {
    lotNumber: `SEARCH-${suffix}`,
    title,
    description: 'Synthetic search fixture',
    condition: 'open_box',
    categoryId,
    locationId,
    retailPriceKobo: 20000000n,
    startPriceKobo: 50000n,
    startAt: new Date(Date.now() - 3600000),
    endAt,
    status: 'open',
  };
}
async function drain() {
  for (let i = 0; i < 10; i++) {
    try {
      const result = await search.sync();
      if (!result.processed) return;
    } catch (error) {
      if (
        !(error instanceof ServiceUnavailableException) ||
        !error.message.includes('indexing timed out')
      )
        throw error;
      await delay(100);
    }
  }
  throw new Error('Search queue did not drain.');
}
const client = () => createSearchClient(baseUrl);
it('finds iPhone lots for iphnoe using real Meilisearch and strictly paginates equal-time matches', async () => {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await client().search({
      q: 'iphnoe',
      categoryId,
      limit: 20,
      cursor,
    });
    ids.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor ?? undefined;
    for (const item of page.items) {
      expect(item.title).toBe('Apple iPhone 13');
      expect(item.currentPriceKobo).toBeNull();
    }
  } while (cursor);
  expect(ids).toEqual([...phoneIds].sort());
  expect(new Set(ids).size).toBe(61);
  const page = await client().search({ q: 'iphnoe', limit: 1 });
  await expect(
    client().search({ q: 'Samsung', cursor: page.nextCursor ?? undefined }),
  ).rejects.toMatchObject({ status: 400 });
});
it('hydrates one or 50 matches with the same four catalogue queries', async () => {
  const queries: string[] = [];
  catalogue.db.$on('query', (event) => queries.push(event.query));
  await client().search({ q: 'iphone', limit: 1 });
  expect(queries).toHaveLength(4);
  queries.length = 0;
  expect(
    (await client().search({ q: 'iphone', limit: 50 })).items,
  ).toHaveLength(50);
  expect(queries).toHaveLength(4);
});
it('supports catalogue filters and validates all public input without accepting raw engine filters', async () => {
  expect(
    (
      await client().search({
        q: 'iphone',
        categoryId,
        locationId,
        endingSoon: true,
        minPriceKobo: 50000,
        maxPriceKobo: 51000,
      })
    ).items,
  ).toHaveLength(2);
  expect(
    (await client().search({ q: 'iphone', categoryId: randomUUID() })).items,
  ).toEqual([]);
  expect(
    (await client().search({ q: 'iphone', locationId: randomUUID() })).items,
  ).toEqual([]);
  expect((await client().search({ q: 'doesnotexist' })).items).toEqual([]);
  for (const query of [
    'q=',
    'q=iphone&limit=51',
    'q=iphone&q=samsung',
    'q=iphone&filter=status%3Ddraft',
    'q=iphone&minPriceKobo=0.5',
    'q=iphone&cursor=bad',
  ])
    expect((await fetch(`${baseUrl}/search?${query}`)).status).toBe(400);
  expect(searchQuerySchema.safeParse({ q: 'a'.repeat(121) }).success).toBe(
    false,
  );
  const doc: { paths: Record<string, unknown> } = await (
    await fetch(`${baseUrl}/docs-json`)
  ).json();
  expect(doc.paths).toHaveProperty('/search');
  expect(doc.paths).not.toHaveProperty('/internal/search/sync');
});
it('hides closed/private and changed-filter rows immediately even while the engine is stale', async () => {
  const closed = await catalogue.db.lot.create({
    data: lotData('Unique stale phone'),
  });
  await drain();
  expect(
    (await client().search({ q: 'stale' })).items.map((item) => item.id),
  ).toContain(closed.id);
  await catalogue.db.lot.update({
    where: { id: closed.id },
    data: { status: 'closed' },
  });
  expect((await client().search({ q: 'stale' })).items).toEqual([]);
  await catalogue.db.lot.update({
    where: { id: closed.id },
    data: { status: 'draft' },
  });
  expect((await client().search({ q: 'stale' })).items).toEqual([]);
  const changed = await catalogue.db.lot.create({
    data: lotData('Unique filter phone'),
  });
  await drain();
  await catalogue.db.lot.update({
    where: { id: changed.id },
    data: { startPriceKobo: 500000n },
  });
  expect(
    (await client().search({ q: 'filter', maxPriceKobo: 50000 })).items,
  ).toEqual([]);
  await drain();
});
it('coalesces committed changes and retries failed indexing without acknowledging newer versions', async () => {
  const lot = await catalogue.db.lot.create({
    data: lotData('Versioned phone'),
  });
  const first = await catalogue.db.searchIndexJob.findUniqueOrThrow({
    where: { lotId: lot.id },
  });
  await catalogue.db.lot.update({
    where: { id: lot.id },
    data: { title: 'Versioned iPhone' },
  });
  const second = await catalogue.db.searchIndexJob.findUniqueOrThrow({
    where: { lotId: lot.id },
  });
  expect(second.version).toBeGreaterThan(first.version);
  let fail = true;
  const flaky: SearchEngine = {
    initialize: () => engine.initialize(),
    remove: (ids) => engine.remove(ids),
    find: (...args) => engine.find(...args),
    async upsert(docs: SearchDocument[]) {
      if (fail) throw new Error('Synthetic search outage');
      await engine.upsert(docs);
    },
  };
  await expect(new SearchService(catalogue, flaky).sync()).rejects.toThrow(
    'Synthetic search outage',
  );
  expect(
    (
      await catalogue.db.searchIndexJob.findUniqueOrThrow({
        where: { lotId: lot.id },
      })
    ).appliedVersion,
  ).toBe(0n);
  fail = false;
  let changed = false;
  const racing: SearchEngine = {
    ...flaky,
    async upsert(docs) {
      await engine.upsert(docs);
      if (!changed) {
        changed = true;
        await catalogue.db.lot.update({
          where: { id: lot.id },
          data: { title: 'Latest versioned iPhone' },
        });
      }
    },
  };
  await new SearchService(catalogue, racing).sync();
  const pending = await catalogue.db.searchIndexJob.findUniqueOrThrow({
    where: { lotId: lot.id },
  });
  expect(pending.version).toBeGreaterThan(pending.appliedVersion);
  await drain();
  const settled = await catalogue.db.searchIndexJob.findUniqueOrThrow({
    where: { lotId: lot.id },
  });
  expect(settled.appliedVersion).toBe(settled.version);
  expect((await client().search({ q: 'latest' })).items[0]?.id).toBe(lot.id);
});
it('rolls back queued revisions with rejected lot updates and does not index drafts/scheduled stock', async () => {
  const draft = await catalogue.db.lot.create({
    data: { ...lotData('Private inventory phone'), status: 'draft' },
  });
  const scheduled = await catalogue.db.lot.create({
    data: { ...lotData('Scheduled inventory phone'), status: 'scheduled' },
  });
  const before = await catalogue.db.searchIndexJob.findUniqueOrThrow({
    where: { lotId: draft.id },
  });
  await expect(
    catalogue.db.$transaction(async (tx) => {
      await tx.lot.update({
        where: { id: draft.id },
        data: { title: 'Rolled back' },
      });
      throw new Error('Roll back fixture');
    }),
  ).rejects.toThrow();
  expect(
    (
      await catalogue.db.searchIndexJob.findUniqueOrThrow({
        where: { lotId: draft.id },
      })
    ).version,
  ).toBe(before.version);
  await drain();
  const results = await client().search({ q: 'inventory' });
  expect(results.items).toEqual([]);
  const hits = await engine.find('inventory', [], 50);
  expect(hits.map((hit) => hit.id)).not.toContain(scheduled.id);
});
it('serializes sync workers, protects the internal route and fails closed during search outage', async () => {
  expect(
    (await fetch(`${baseUrl}/internal/search/sync`, { method: 'POST' })).status,
  ).toBe(401);
  expect(
    (
      await fetch(`${baseUrl}/internal/search/sync`, {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong' },
      })
    ).status,
  ).toBe(401);
  const token = process.env.SEARCH_SYNC_TOKEN;
  if (!token) throw new Error('Missing test token');
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  expect(
    (
      await fetch(`${baseUrl}/internal/search/sync`, {
        method: 'POST',
        headers,
        body: '{"index":"other"}',
      })
    ).status,
  ).toBe(400);
  let entered = () => {};
  let release = () => {};
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const blocking: SearchEngine = {
    initialize: async () => {
      entered();
      await gate;
    },
    upsert: (docs) => engine.upsert(docs),
    remove: (ids) => engine.remove(ids),
    find: (...args) => engine.find(...args),
  };
  const first = new SearchService(catalogue, blocking).sync();
  await ready;
  try {
    expect(await search.sync()).toEqual({ processed: 0, busy: true });
  } finally {
    release();
    await first;
  }
  await expect(
    new SearchService(catalogue).search(
      searchInputSchema.parse({ q: 'iphone' }),
    ),
  ).rejects.toThrow('not configured');
  const unavailable = new SearchService(
    catalogue,
    new MeilisearchEngine('http://127.0.0.1:9', 'synthetic-key', index),
  );
  await expect(
    unavailable.search(searchInputSchema.parse({ q: 'iphone' })),
  ).rejects.toThrow('temporarily unavailable');
});
it('uses the real BullMQ worker to index a new lot and remove it within ten seconds after close', async () => {
  const token = process.env.SEARCH_SYNC_TOKEN;
  if (!token) throw new Error('Missing test token');
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  if (!['localhost', '127.0.0.1'].includes(url.hostname))
    throw new Error('Local test Redis required.');
  const worker = await startSearchWorker(
    {
      host: url.hostname,
      port: Number(url.port || 6379),
      username: url.username || undefined,
      password: url.password || undefined,
      db: Number(url.pathname.slice(1) || 0),
    },
    {
      token,
      apiUrl: baseUrl,
      queueName: `auction-ng-search-test-${randomUUID()}`,
    },
  );
  async function until(check: () => Promise<boolean>) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (await check()) return;
      await delay(100);
    }
    throw new Error('Worker search synchronization exceeded ten seconds.');
  }
  try {
    const lot = await catalogue.db.lot.create({
      data: lotData('Worker canary iPhone'),
    });
    await until(async () =>
      (await client().search({ q: 'canary' })).items.some(
        (item) => item.id === lot.id,
      ),
    );
    await catalogue.db.lot.update({
      where: { id: lot.id },
      data: { title: 'Worker renamed iPhone' },
    });
    await until(async () =>
      (await client().search({ q: 'renamed' })).items.some(
        (item) => item.id === lot.id,
      ),
    );
    const started = Date.now();
    await catalogue.db.lot.update({
      where: { id: lot.id },
      data: { status: 'closed' },
    });
    await until(
      async () =>
        !(await engine.find('renamed', [], 50)).some(
          (hit) => hit.id === lot.id,
        ),
    );
    expect(Date.now() - started).toBeLessThan(10000);
    expect((await client().search({ q: 'renamed' })).items).toEqual([]);
    console.log(
      `Worker removed the closed canary from Meilisearch in ${Date.now() - started} ms.`,
    );
  } finally {
    await worker.close();
  }
}, 25000);
