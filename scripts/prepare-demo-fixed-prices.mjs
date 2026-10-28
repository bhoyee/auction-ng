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
  throw new Error('Mismatched demo namespace.');
url.hostname = 'localhost';
process.env.DATA_ENCRYPTION_KEY = config.DATA_ENCRYPTION_KEY;
process.env.PII_HASH_KEY = config.PII_HASH_KEY;
const { Pool } = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
)('pg');
const pool = new Pool({ connectionString: url.href });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const rows = await client.query(
    `SELECT id,lot_number,title,start_price_kobo,retail_price_kobo FROM lots l WHERE is_top_deal=true AND status='open' AND end_at>now()+interval '20 minutes' AND lot_number LIKE 'DEMO-%' AND description LIKE 'Demo only:%' AND NOT EXISTS(SELECT 1 FROM bids b WHERE b.lot_id=l.id) AND NOT EXISTS(SELECT 1 FROM bid_funding_intents i WHERE i.lot_id=l.id) AND NOT EXISTS(SELECT 1 FROM purchases p WHERE p.lot_id=l.id) ORDER BY top_deal_order,id LIMIT 4 FOR UPDATE`,
  );
  if (rows.rows.length !== 4)
    throw new Error('Four unused featured demo lots are required.');
  for (const row of rows.rows) {
    const price =
      BigInt(row.retail_price_kobo) / 2n > BigInt(row.start_price_kobo)
        ? BigInt(row.retail_price_kobo) / 2n
        : BigInt(row.start_price_kobo);
    await client.query(
      'UPDATE lots SET fixed_price_kobo=$1,updated_at=clock_timestamp() WHERE id=$2',
      [price.toString(), row.id],
    );
    await client.query(
      'INSERT INTO audit_log(action,entity_type,entity_id,after_ciphertext) VALUES($1,$2,$3,$4)',
      [
        'demo.fixed_price_added',
        'lot',
        row.id,
        encryptPii(
          JSON.stringify({ fixedPriceKobo: price.toString() }),
          'audit',
        ),
      ],
    );
  }
  await client.query('COMMIT');
  console.log(
    `Added fixed prices to ${rows.rows.length} unused demo lots; no bids, timers or funds changed.`,
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
