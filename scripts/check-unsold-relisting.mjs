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
  throw new Error('Local test server required.');
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
  BID_TEST_DATABASE_URL: url.href,
  TOP_DEALS_TEST_DATABASE_URL: url.href,
  NODE_ENV: 'test',
  AUTH_MODE: 'local',
  BIDS_ENABLED: 'false',
  SMTP_PASSWORD: '',
  RESEND_API_KEY: '',
  DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  PII_HASH_KEY: randomBytes(32).toString('base64'),
};
function run(args) {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Focused relisting check failed.');
}
run(['scripts/database.mjs', 'migrate']);
if (!process.argv.includes('--admin-only')) {
  run([
    root.resolve('vitest/vitest.mjs'),
    'run',
    '--config',
    'vitest.bids.config.ts',
    'apps/api/tests/lot-closing.test.ts',
  ]);
  // Staff authentication fixtures must not share bid-runtime eligibility fences.
  const staffUrl = new URL(url);
  const staffName = `auction_ng_test_${randomBytes(8).toString('hex')}`;
  const staffPool = new Pool({ connectionString: url.href });
  try {
    await staffPool.query(`CREATE DATABASE "${staffName}"`);
  } finally {
    await staffPool.end();
  }
  staffUrl.pathname = `/${staffName}`;
  env.DATABASE_URL = staffUrl.href;
  env.TOP_DEALS_TEST_DATABASE_URL = staffUrl.href;
  run(['scripts/database.mjs', 'migrate']);
}
run([
  root.resolve('vitest/vitest.mjs'),
  'run',
  'apps/api/tests/top-deals.test.ts',
  '--coverage.enabled=false',
]);
run(['scripts/database.mjs', 'docs']);
console.log(
  'Closing and admin checks passed; isolated test database retained.',
);
