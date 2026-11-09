import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
if (existsSync('.env')) loadEnvFile('.env');
const api = createRequire(new URL('../apps/api/package.json', import.meta.url));
const root = createRequire(new URL('../package.json', import.meta.url));
const { Pool } = api('pg');
const url = new URL(
  process.env.TEST_DATABASE_ADMIN_URL ?? process.env.DATABASE_URL,
);
if (process.env.TEST_DATABASE_HOST)
  url.hostname = process.env.TEST_DATABASE_HOST;
if (!['localhost', '127.0.0.1', 'postgres'].includes(url.hostname))
  throw new Error('Local isolated test server required.');
const pool = new Pool({ connectionString: url.href });
const name = `auction_ng_test_${randomBytes(8).toString('hex')}`;
try {
  await pool.query(`CREATE DATABASE "${name}"`);
} finally {
  await pool.end();
}
url.pathname = `/${name}`;
const env = {
  ...process.env,
  DATABASE_URL: url.href,
  TEST_DATABASE_URL: url.href,
  PURCHASE_TEST_DATABASE_URL: url.href,
  BID_TEST_DATABASE_URL: url.href,
  NODE_ENV: 'test',
  AUTH_MODE: 'local',
  BIDS_ENABLED: 'false',
  SMTP_PASSWORD: '',
  RESEND_API_KEY: '',
  DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  PII_HASH_KEY: randomBytes(32).toString('base64'),
};
function run(args) {
  const r = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('Purchase check failed.');
}
run(['scripts/database.mjs', 'migrate']);
run([
  root.resolve('vitest/vitest.mjs'),
  'run',
  'tests/purchase-fees.test.ts',
  '--coverage.enabled=false',
]);
run([
  root.resolve('vitest/vitest.mjs'),
  'run',
  '--config',
  'vitest.bids.config.ts',
  'apps/api/tests/purchases.test.ts',
]);
if (process.argv.includes('--closing'))
  run([
    root.resolve('vitest/vitest.mjs'),
    'run',
    '--config',
    'vitest.bids.config.ts',
    'apps/api/tests/lot-closing.test.ts',
  ]);
if (process.argv.includes('--bids'))
  run([
    root.resolve('vitest/vitest.mjs'),
    'run',
    '--config',
    'vitest.bids.config.ts',
    'tests/bid-lua.test.ts',
    'apps/api/tests/bid-funding.test.ts',
    'apps/api/tests/bid-persistence.test.ts',
  ]);
if (process.argv.includes('--realtime'))
  run([
    root.resolve('vitest/vitest.mjs'),
    'run',
    '--config',
    'vitest.realtime.config.ts',
  ]);
run(['scripts/database.mjs', 'docs']);
run([
  root.resolve('vitest/vitest.mjs'),
  'run',
  'tests/database.test.ts',
  '-t',
  'documents every deployed|has all 33',
  '--coverage.enabled=false',
]);
console.log('Purchase checks passed; isolated database retained.');
