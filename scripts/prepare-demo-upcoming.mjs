import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import { assertDemoDatabase } from '../apps/api/prisma/demo-catalogue.ts';
import { encryptPii } from '../apps/api/src/security/pii.ts';
const config = parseEnv(
  await readFile(new URL('../.env.demo', import.meta.url), 'utf8'),
);
const url = new URL(config.DEMO_DATABASE_URL ?? '');
assertDemoDatabase(url.href, process.env.NODE_ENV);
if (config.DEMO_BID_NAMESPACE !== `auction:demo:${url.pathname.slice(1)}:`)
  throw Error('Demo namespace does not match its database.');
url.hostname = 'localhost';
process.env.DATA_ENCRYPTION_KEY = config.DATA_ENCRYPTION_KEY;
process.env.PII_HASH_KEY = config.PII_HASH_KEY;
const require = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: url.href,
    connectionTimeoutMillis: 5000,
  }),
  client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('demo-upcoming-preview',0))",
  );
  const existing = await client.query(
    "SELECT id,lot_number,status,start_at FROM lots WHERE description LIKE 'Demo only: Upcoming preview.%' ORDER BY start_at,id",
  );
  if (existing.rows.length) {
    await client.query('COMMIT');
    console.log(JSON.stringify({ created: 0, existing: existing.rows }));
  } else {
    const sources = await client.query(
      "SELECT DISTINCT ON (i.thumbnail_url) l.id FROM lots l JOIN lot_images i ON i.lot_id=l.id AND i.sort_order=0 WHERE l.lot_number LIKE 'DEMO-%' AND l.description LIKE 'Demo only:%' AND i.thumbnail_url LIKE 'https://demo.auction.invalid/demo/%' ORDER BY i.thumbnail_url,l.id LIMIT 4",
    );
    if (sources.rows.length !== 4)
      throw Error(
        'Four labelled demo photos are required. Seed the demo catalogue first.',
      );
    const rows = [],
      hours = [6, 12, 24, 72],
      now = Date.now();
    for (const [index, source] of sources.rows.entries()) {
      const startsAt = new Date(now + hours[index] * 3600000),
        endsAt = new Date(startsAt.getTime() + 86400000);
      const saved = await client.query(
        "INSERT INTO lots(title,description,condition,retail_price_kobo,start_price_kobo,category_id,location_id,start_at,end_at,status,is_top_deal) SELECT title,'Demo only: Upcoming preview. '||description,condition,retail_price_kobo,start_price_kobo,category_id,location_id,$2,$3,'scheduled',false FROM lots WHERE id=$1 RETURNING id,lot_number,title,start_at,end_at",
        [source.id, startsAt, endsAt],
      );
      const item = saved.rows[0];
      if (!item) throw Error('Demo source disappeared.');
      await client.query(
        'INSERT INTO lot_images(lot_id,url,sort_order,thumbnail_url,width,height,thumbnail_bytes) SELECT $2,url,sort_order,thumbnail_url,width,height,thumbnail_bytes FROM lot_images WHERE lot_id=$1',
        [source.id, item.id],
      );
      rows.push(item);
    }
    await client.query(
      "INSERT INTO audit_log(action,entity_type,entity_id,after_ciphertext) VALUES ('demo.upcoming_preview_added','catalogue',$1,$2)",
      [
        url.pathname.slice(1),
        encryptPii(
          JSON.stringify({
            lotIds: rows.map((row) => row.id),
            existingAuctionsUnchanged: true,
          }),
          'audit',
        ),
      ],
    );
    await client.query('COMMIT');
    console.log(JSON.stringify({ created: rows.length, items: rows }));
  }
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
