import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { LedgerService } from '../src/ledger/ledger-service';
import { LotsAdminService } from '../src/lots/lots-admin-service';
import { encryptPii, hashPii } from '../src/security/pii';

// Lots list budget (T15e): under 300 ms (p95) with 50,000 lots, for each tab,
// sort and a combined filter.
let ledger: LedgerService;
let lots: LotsAdminService;
let adminId = '';

beforeAll(async () => {
  const url = process.env.LOTS_ADMIN_TEST_DATABASE_URL;
  if (!url || !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
    throw new Error('Isolated lots database required.');
  ledger = new LedgerService(url);
  lots = new LotsAdminService(ledger);
  const email = `${randomUUID()}@example.test`;
  adminId = (
    await ledger.db.user.create({
      data: {
        name: 'Perf admin',
        role: 'admin',
        emailHash: hashPii(email, 'email'),
        emailCiphertext: encryptPii(email, 'email'),
      },
    })
  ).id;
  const cats = await Promise.all(
    ['Phones', 'Kitchen', 'Computers', 'Fashion'].map((name) =>
      ledger.db.category.create({
        data: {
          name: `${name} ${randomUUID().slice(0, 6)}`,
          slug: randomUUID(),
        },
      }),
    ),
  );
  const loc = await ledger.db.location.create({
    data: {
      code: randomBytes(2)
        .toString('hex')
        .replace(/\d/g, 'x')
        .slice(0, 3)
        .toUpperCase()
        .padEnd(3, 'Z'),
      name: `Perf hub ${randomUUID().slice(0, 6)}`,
      address: 'Synthetic',
      hours: {},
      capacityPerSlot: 20,
    },
  });
  const statuses = ['draft', 'scheduled', 'open', 'closed', 'cancelled'];
  // 50,000 lots spread across statuses, categories and end times, in
  // batches so per-row triggers stay within one transaction's lock budget.
  for (let from = 1; from <= 50_000; from += 2_000)
    await ledger.db.$executeRawUnsafe(`
    INSERT INTO lots (title, description, condition, retail_price_kobo, start_price_kobo, category_id, location_id, start_at, end_at, status, created_by_id, created_at)
    SELECT 'Perf item ' || g, 'Synthetic', (ARRAY['new','like_new','open_box','damaged','untested'])[1 + g % 5],
      100000 + g * 10, 50000 + (g % 997) * 100,
      (ARRAY['${cats.map((c) => c.id).join("','")}'])[1 + g % 4]::uuid, '${loc.id}'::uuid,
      now() - interval '1 day' + (g % 500) * interval '1 minute',
      now() + (g % 4000) * interval '1 minute',
      (ARRAY['${statuses.join("','")}'])[1 + g % 5],
      '${adminId}'::uuid, now() - (g % 20000) * interval '1 minute'
    FROM generate_series(${from}, ${from + 1999}) g`);
  await ledger.db.$executeRawUnsafe('ANALYZE lots');
}, 600_000);
afterAll(async () => {
  await ledger?.close();
});

it('answers every tab and sort in under 300 ms (p95) with 50,000 lots', async () => {
  expect(await ledger.db.lot.count()).toBeGreaterThanOrEqual(50_000);
  const queries = [
    { tab: 'all', sort: 'ending' },
    { tab: 'live', sort: 'ending' },
    { tab: 'drafts', sort: 'newest' },
    { tab: 'ending', sort: 'ending' },
    { tab: 'all', sort: 'price' },
    { tab: 'all', sort: 'bids' },
    {
      tab: 'all',
      sort: 'ending',
      search: 'item 4',
      conditions: 'new,open_box',
    },
  ];
  const report: string[] = [];
  for (const q of queries) {
    await lots.list(adminId, q); // warm
    const times: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      const start = performance.now();
      const page = await lots.list(adminId, q);
      times.push(performance.now() - start);
      expect(page.items.length).toBeGreaterThan(0);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.ceil(times.length * 0.95) - 1] ?? 0;
    report.push(`${JSON.stringify(q)} p95 ${p95.toFixed(0)} ms`);
    expect(p95, JSON.stringify(q)).toBeLessThan(300);
  }
  console.log(report.join('\n'));
}, 600_000);
