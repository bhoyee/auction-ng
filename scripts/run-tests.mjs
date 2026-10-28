import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
if (existsSync(new URL('.env', root)))
  loadEnvFile(fileURLToPath(new URL('.env', root)));
const apiRequire = createRequire(new URL('apps/api/package.json', root));
const { default: pg } = await import(
  pathToFileURL(apiRequire.resolve('pg')).href
);
if (!process.env.DATABASE_URL)
  throw new Error('DATABASE_URL is required for database tests.');
const adminUrl = new URL(
  process.env.TEST_DATABASE_ADMIN_URL ?? process.env.DATABASE_URL,
);
const databaseName = `auction_ng_test_${randomBytes(8).toString('hex')}`;
const authDatabaseName = `auction_ng_test_${randomBytes(8).toString('hex')}`;
const ledgerDatabaseName = `auction_ng_test_${randomBytes(8).toString('hex')}`;
const searchDatabaseName = `auction_ng_test_${randomBytes(8).toString('hex')}`;
const bidDatabaseName = `auction_ng_test_${randomBytes(8).toString('hex')}`;
const buyerDatabaseName = `auction_ng_test_${randomBytes(8).toString('hex')}`;
const topDealsDatabaseName = `auction_ng_test_${randomBytes(8).toString('hex')}`;
if (!/^auction_ng_test_[a-f0-9]{16}$/.test(databaseName))
  throw new Error('Invalid test database name.');
const pool = new pg.Pool({
  connectionString: adminUrl.href,
  connectionTimeoutMillis: 5000,
});
try {
  await pool.query(`CREATE DATABASE "${databaseName}"`);
  await pool.query(`CREATE DATABASE "${authDatabaseName}"`);
  await pool.query(`CREATE DATABASE "${ledgerDatabaseName}"`);
  await pool.query(`CREATE DATABASE "${searchDatabaseName}"`);
  await pool.query(`CREATE DATABASE "${bidDatabaseName}"`);
  await pool.query(`CREATE DATABASE "${buyerDatabaseName}"`);
  await pool.query(`CREATE DATABASE "${topDealsDatabaseName}"`);
} finally {
  await pool.end();
}
adminUrl.pathname = `/${databaseName}`;
const authUrl = new URL(adminUrl);
authUrl.pathname = `/${authDatabaseName}`;
const ledgerUrl = new URL(adminUrl);
ledgerUrl.pathname = `/${ledgerDatabaseName}`;
const searchUrl = new URL(adminUrl);
searchUrl.pathname = `/${searchDatabaseName}`;
const bidUrl = new URL(adminUrl);
bidUrl.pathname = `/${bidDatabaseName}`;
const buyerUrl = new URL(adminUrl);
buyerUrl.pathname = `/${buyerDatabaseName}`;
const topDealsUrl = new URL(adminUrl);
topDealsUrl.pathname = `/${topDealsDatabaseName}`;
const env = {
  ...process.env,
  DATABASE_URL: adminUrl.href,
  TEST_DATABASE_URL: adminUrl.href,
  AUTH_TEST_DATABASE_URL: authUrl.href,
  LEDGER_TEST_DATABASE_URL: ledgerUrl.href,
  SEARCH_TEST_DATABASE_URL: searchUrl.href,
  BID_TEST_DATABASE_URL: bidUrl.href,
  BUYER_TEST_DATABASE_URL: buyerUrl.href,
  TOP_DEALS_TEST_DATABASE_URL: topDealsUrl.href,
  SEARCH_SYNC_TOKEN: randomBytes(32).toString('hex'),
  NODE_ENV: 'test',
  AUTH_MODE: 'local',
  SMTP_PASSWORD: '',
  RESEND_API_KEY: '',
  BIDS_ENABLED: 'false',
  DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  PII_HASH_KEY: randomBytes(32).toString('base64'),
};
function run(args, commandEnv = env) {
  const result = spawnSync(process.execPath, args, {
    cwd: fileURLToPath(root),
    env: commandEnv,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
// Test databases are isolated and deliberately retained; never reset user data.
console.log(`Using new isolated test database ${databaseName}.`);
let status = run(['scripts/database.mjs', 'generate']);
if (status === 0) status = run(['scripts/database.mjs', 'migrate']);
if (status === 0)
  status = run(['scripts/database.mjs', 'migrate'], {
    ...env,
    DATABASE_URL: authUrl.href,
  });
if (status === 0) {
  status = run(['scripts/database.mjs', 'migrate'], {
    ...env,
    DATABASE_URL: ledgerUrl.href,
  });
}
if (status === 0) {
  status = run(['scripts/database.mjs', 'migrate'], {
    ...env,
    DATABASE_URL: searchUrl.href,
  });
}
if (status === 0)
  status = run(['scripts/database.mjs', 'migrate'], {
    ...env,
    DATABASE_URL: bidUrl.href,
  });
if (status === 0)
  status = run(['scripts/database.mjs', 'migrate'], {
    ...env,
    DATABASE_URL: buyerUrl.href,
  });
if (status === 0)
  status = run(['scripts/database.mjs', 'migrate'], {
    ...env,
    DATABASE_URL: topDealsUrl.href,
  });
if (status === 0) {
  const require = createRequire(new URL('package.json', root));
  status = run([require.resolve('vitest/vitest.mjs'), 'run']);
  if (status === 0)
    status = run([
      require.resolve('vitest/vitest.mjs'),
      'run',
      '--config',
      'vitest.bids.config.ts',
    ]);
  if (status === 0)
    status = run([
      require.resolve('vitest/vitest.mjs'),
      'run',
      '--config',
      'vitest.realtime.config.ts',
    ]);
  if (status === 0)
    status = run([
      require.resolve('vitest/vitest.mjs'),
      'run',
      '--config',
      'vitest.search.config.ts',
    ]);
  if (status === 0)
    status = run([
      require.resolve('vitest/vitest.mjs'),
      'run',
      '--config',
      'vitest.catalogue.config.ts',
    ]);
}
process.exitCode = status;
