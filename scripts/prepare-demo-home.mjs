import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import { assertDemoDatabase } from '../apps/api/prisma/demo-catalogue.ts';
import { encryptPii } from '../apps/api/src/security/pii.ts';

// Explicitly use the private demo configuration, never the normal application URL.
const config = parseEnv(
  await readFile(new URL('../.env.demo', import.meta.url), 'utf8'),
);
const url = new URL(config.DEMO_DATABASE_URL ?? '');
assertDemoDatabase(url.href, process.env.NODE_ENV);
if (config.DEMO_BID_NAMESPACE !== `auction:demo:${url.pathname.slice(1)}:`)
  throw new Error('The demo database and Redis namespace must match.');
url.hostname = 'localhost';
process.env.DATA_ENCRYPTION_KEY = config.DATA_ENCRYPTION_KEY;
process.env.PII_HASH_KEY = config.PII_HASH_KEY;
const requireApi = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const { Pool } = requireApi('pg');
const pool = new Pool({
  connectionString: url.href,
  connectionTimeoutMillis: 5000,
});
const client = await pool.connect();
const topHours = [6, 12, 24, 48, 72, 96, 120, 36];
const closingMinutes = [8, 12, 16, 19];
try {
  await client.query('BEGIN');
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('demo-home-preview', 0))",
  );
  const current = await client.query('SELECT current_database() AS name');
  if (current.rows[0]?.name !== url.pathname.slice(1))
    throw new Error('Unexpected demo database.');
  const sources = await client.query(`
    SELECT l.id, i.thumbnail_url
    FROM lots l JOIN lot_images i ON i.lot_id=l.id AND i.sort_order=0
    JOIN categories c ON c.id=l.category_id
    WHERE l.lot_number LIKE 'DEMO-%' AND l.description LIKE 'Demo only:%'
      AND l.description NOT LIKE 'Demo only: Homepage preview.%'
      AND i.thumbnail_url LIKE 'https://demo.auction.invalid/demo/%'
    ORDER BY CASE WHEN c.name ILIKE '%phone%' THEN 0 WHEN c.name='Electronics' THEN 1 WHEN c.name='Computers' THEN 2 ELSE 3 END, l.id
  `);
  const photos = new Set();
  const selected = sources.rows
    .filter((row) => {
      if (photos.has(row.thumbnail_url)) return false;
      photos.add(row.thumbnail_url);
      return true;
    })
    .slice(0, 12);
  if (selected.length !== 12)
    throw new Error('Twelve distinct labelled demo photos are required.');
  const created = [];
  const now = Date.now();
  for (const [index, source] of selected.entries()) {
    const featured = index < topHours.length;
    const endsAt = new Date(
      now +
        (featured
          ? topHours[index] * 3600000
          : closingMinutes[index - topHours.length] * 60000),
    );
    const result = await client.query(
      `
      INSERT INTO lots (lot_number,title,description,condition,retail_price_kobo,start_price_kobo,category_id,location_id,start_at,end_at,status,is_top_deal,top_deal_order)
      SELECT 'DEMO-PREVIEW-' || auction_reference_code(), title,
        'Demo only: Homepage preview. ' || description, condition, retail_price_kobo,start_price_kobo,category_id,location_id,$2,$3,'open',$4,$5
      FROM lots WHERE id=$1 RETURNING id,lot_number,title,end_at,is_top_deal
    `,
      [
        source.id,
        new Date(now - 60000),
        endsAt,
        featured,
        featured ? index + 1 : 0,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Demo source was not found.');
    await client.query(
      `INSERT INTO lot_images (lot_id,url,sort_order,thumbnail_url,width,height,thumbnail_bytes)
      SELECT $2,url,sort_order,thumbnail_url,width,height,thumbnail_bytes FROM lot_images WHERE lot_id=$1`,
      [source.id, row.id],
    );
    created.push(row);
  }
  await client.query(
    `INSERT INTO audit_log (action,entity_type,entity_id,after_ciphertext) VALUES ('demo.home_preview_added','catalogue',$1,$2)`,
    [
      url.pathname.slice(1),
      encryptPii(
        JSON.stringify({
          lotIds: created.map((row) => row.id),
          topDeals: 8,
          closingNow: 4,
          existingAuctionsUnchanged: true,
        }),
        'audit',
      ),
    ],
  );
  await client.query('COMMIT');
  console.log(
    JSON.stringify(
      {
        topDeals: 8,
        closingNow: 4,
        closingMinutes,
        topDealHours: topHours,
        existingAuctionsUnchanged: true,
        lots: created.map((row) => ({
          reference: row.lot_number,
          title: row.title,
          endsAt: row.end_at,
          featured: row.is_top_deal,
        })),
      },
      null,
      2,
    ),
  );
} catch {
  await client.query('ROLLBACK');
  throw new Error(
    'Demo preview preparation failed. Check local demo configuration and available sample photos; no existing auction is changed.',
  );
} finally {
  client.release();
  await pool.end();
}
