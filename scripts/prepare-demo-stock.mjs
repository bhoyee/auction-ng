import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import { assertDemoDatabase } from '../apps/api/prisma/demo-catalogue.ts';
import { encryptPii } from '../apps/api/src/security/pii.ts';
import { imageRules } from '../packages/shared/src/catalogue-schemas.ts';
import { merchandisingRules } from '../packages/shared/src/merchandising.ts';
// Add missing demo stock without reopening old auctions or changing any commitments.
const config = parseEnv(
  await readFile(new URL('../.env.demo', import.meta.url), 'utf8'),
);
const url = new URL(config.DEMO_DATABASE_URL ?? '');
assertDemoDatabase(url.href, process.env.NODE_ENV);
if (config.DEMO_BID_NAMESPACE !== `auction:demo:${url.pathname.slice(1)}:`)
  throw Error('Demo namespace mismatch.');
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
});
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('demo-home-four-stock',0))",
  );
  const actual = await client.query('SELECT current_database() AS name');
  if (actual.rows[0]?.name !== url.pathname.slice(1))
    throw Error('Unexpected database.');
  const rows = (
    await client.query(
      "SELECT l.*,i.thumbnail_url FROM lots l LEFT JOIN lot_images i ON i.lot_id=l.id AND i.sort_order=0 WHERE l.description LIKE 'Demo only:%' ORDER BY l.id",
    )
  ).rows;
  const now = Date.now(),
    near = merchandisingRules.closingWindowMs,
    ending = imageRules.endingSoonMs;
  const open = (row) =>
    ['open', 'closing'].includes(row.status) &&
    new Date(row.end_at).getTime() > now;
  const available = rows.filter(
    (row) =>
      open(row) ||
      (row.status === 'scheduled' && new Date(row.start_at).getTime() > now),
  );
  const photos = new Set(
    available.map((row) => row.thumbnail_url).filter(Boolean),
  );
  const source = () => {
    const row = rows.find(
      (row) =>
        row.thumbnail_url?.startsWith('https://demo.auction.invalid/demo/') &&
        !photos.has(row.thumbnail_url),
    );
    if (!row) return undefined;
    photos.add(row.thumbnail_url);
    return row;
  };
  const groups = [
    {
      kind: 'closing',
      target: 4,
      count: rows.filter(
        (row) => open(row) && new Date(row.end_at).getTime() <= now + near,
      ).length,
    },
    {
      kind: 'ending',
      target: 8,
      count: rows.filter(
        (row) =>
          open(row) &&
          new Date(row.end_at).getTime() > now + near &&
          new Date(row.end_at).getTime() <= now + ending,
      ).length,
    },
    {
      kind: 'featured',
      target: 20,
      count: rows.filter(
        (row) =>
          open(row) &&
          row.is_top_deal &&
          new Date(row.end_at).getTime() > now + ending,
      ).length,
    },
    {
      kind: 'upcoming',
      target: 16,
      count: rows.filter(
        (row) =>
          row.status === 'scheduled' && new Date(row.start_at).getTime() > now,
      ).length,
    },
  ];
  const created = [];
  for (const group of groups)
    for (let i = group.count; i < group.target; i++) {
      const item = source(),
        scheduled = group.kind === 'upcoming';
      if (!item) break;
      const start = new Date(
        scheduled ? now + (6 + i * 6) * 3600000 : now - 60000,
      );
      const end = new Date(
        group.kind === 'closing'
          ? now + near - (4 - i) * 60000
          : group.kind === 'ending'
            ? now + near + ((i + 1) * (ending - near)) / 5
            : scheduled
              ? start.getTime() + 86400000
              : now + (24 + i * 6) * 3600000,
      );
      const saved = (
        await client.query(
          "INSERT INTO lots(lot_number,title,description,condition,retail_price_kobo,start_price_kobo,fixed_price_kobo,category_id,location_id,start_at,end_at,status,is_top_deal,top_deal_order) SELECT 'DEMO-PREVIEW-'||auction_reference_code(),title,'Demo only: Expanded catalogue preview. '||description,condition,retail_price_kobo,start_price_kobo,CASE WHEN $5 THEN GREATEST(start_price_kobo,retail_price_kobo/2) ELSE NULL END,category_id,location_id,$2,$3,$4,$5,$6 FROM lots WHERE id=$1 RETURNING id,lot_number",
          [
            item.id,
            start,
            end,
            scheduled ? 'scheduled' : 'open',
            group.kind === 'featured',
            i + 1,
          ],
        )
      ).rows[0];
      if (!saved) throw Error('Missing demo source.');
      await client.query(
        'INSERT INTO lot_images(lot_id,url,sort_order,thumbnail_url,width,height,thumbnail_bytes) SELECT $2,url,sort_order,thumbnail_url,width,height,thumbnail_bytes FROM lot_images WHERE lot_id=$1',
        [item.id, saved.id],
      );
      created.push({
        id: saved.id,
        reference: saved.lot_number,
        section: group.kind,
      });
    }
  if (created.length)
    await client.query(
      "INSERT INTO audit_log(action,entity_type,entity_id,after_ciphertext) VALUES ('demo.expanded_stock_added','catalogue',$1,$2)",
      [
        url.pathname.slice(1),
        encryptPii(
          JSON.stringify({ created, existingAuctionsUnchanged: true }),
          'audit',
        ),
      ],
    );
  await client.query('COMMIT');
  console.log(
    JSON.stringify({
      created: created.length,
      sections: groups,
      existingAuctionsUnchanged: true,
    }),
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
