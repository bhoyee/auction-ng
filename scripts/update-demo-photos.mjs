import { readFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { createRequire } from 'node:module';
const root = new URL('../', import.meta.url);
loadEnvFile(new URL('../.env.demo', import.meta.url));
if (process.env.NODE_ENV === 'production')
  throw new Error('Demo photos are local only.');
const connection = new URL(process.env.DEMO_DATABASE_URL ?? '');
if (
  !['localhost', '127.0.0.1', 'postgres'].includes(connection.hostname) ||
  !/^\/auction_ng_demo_[a-f0-9]{10,32}$/.test(connection.pathname)
)
  throw new Error('Use the isolated local demo database.');
connection.hostname = 'localhost';
const require = createRequire(new URL('apps/api/package.json', root));
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: connection.href,
  connectionTimeoutMillis: 5000,
});
const base = JSON.parse(
  await readFile(new URL('apps/web/public/demo/photos.json', root), 'utf8'),
);
const variants = JSON.parse(
  await readFile(
    new URL('apps/web/public/demo/photo-variants.json', root),
    'utf8',
  ),
);
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const { rows } = await client.query(
    'SELECT l.id, l.lot_number, l.description, l.status, c.slug FROM lots l JOIN categories c ON c.id = l.category_id ORDER BY l.created_at, l.id',
  );
  if (
    rows.length !== 120 ||
    rows.some(
      (lot) =>
        !lot.lot_number.startsWith('DEMO-') ||
        !lot.description.startsWith('Demo only:') ||
        !['open', 'scheduled'].includes(lot.status),
    )
  )
    throw new Error(
      'Only the unmodified synthetic catalogue may receive representative photos.',
    );
  const counters = new Map();
  const sources = new Set();
  for (const lot of rows) {
    const category = base.findIndex(
      (photo) => lot.slug === `demo-${photo.key}`,
    );
    if (category < 0) throw new Error('Unexpected demo category.');
    const photos = [
      base[category],
      ...variants.filter((photo) => photo.category === category),
    ];
    const occurrence = counters.get(category) ?? 0;
    counters.set(category, occurrence + 1);
    const photo = photos[occurrence % photos.length];
    sources.add(photo.key);
    const bytes = (
      await readFile(
        new URL(`apps/web/public/demo/${photo.key}-thumb.webp`, root),
      )
    ).length;
    if (bytes > 30000) throw new Error('Thumbnail exceeds the data budget.');
    await client.query('UPDATE lots SET title = $1 WHERE id = $2', [
      photo.product,
      lot.id,
    ]);
    await client.query(
      'UPDATE lot_images SET url = $1, thumbnail_url = $2, thumbnail_bytes = $3 WHERE lot_id = $4 AND sort_order = 0',
      [
        `https://demo.auction.invalid/demo/${photo.key}-display.webp`,
        `https://demo.auction.invalid/demo/${photo.key}-thumb.webp`,
        bytes,
        lot.id,
      ],
    );
  }
  if (sources.size < 60)
    throw new Error('Sixty distinct photo sources are required.');
  await client.query('COMMIT');
  console.log(
    `Updated only synthetic titles/photos: ${rows.length} demo lots, ${sources.size} distinct product photos. Auction schedules, bids, wallets and identities are unchanged.`,
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
