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
const purchaseDatabaseName = `auction_ng_test_${randomBytes(8).toString('hex')}`;
const controlsDatabaseName = `auction_ng_test_${randomBytes(8).toString('hex')}`;
const feesDatabaseName = `auction_ng_test_${randomBytes(8).toString('hex')}`;
const prebidDatabaseName = `auction_ng_test_${randomBytes(8).toString('hex')}`;
const cancellationDatabaseName = `auction_ng_test_${randomBytes(8).toString('hex')}`;
const withdrawalsDatabaseName = `auction_ng_test_${randomBytes(8).toString('hex')}`;
const staffAdminDatabaseName = `auction_ng_test_${randomBytes(8).toString('hex')}`;
const staffOptionalMfaDatabaseName = `auction_ng_test_${randomBytes(8).toString('hex')}`;
const staffActivityDatabaseName = `auction_ng_test_${randomBytes(8).toString('hex')}`;
const watchLaunchDatabaseName = `auction_ng_test_${randomBytes(8).toString('hex')}`;
const staffSetupDatabaseName = `auction_ng_test_${randomBytes(8).toString('hex')}`;
const overviewDatabaseName = `auction_ng_test_${randomBytes(8).toString('hex')}`;
const storageDatabaseName = `auction_ng_test_${randomBytes(8).toString('hex')}`;
const liveMonitorDatabaseName = `auction_ng_test_${randomBytes(8).toString('hex')}`;
const watchResultsDatabaseName = `auction_ng_test_${randomBytes(8).toString('hex')}`;
const lotSetupDatabaseName = `auction_ng_test_${randomBytes(8).toString('hex')}`;
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
  await pool.query(`CREATE DATABASE "${purchaseDatabaseName}"`);
  await pool.query(`CREATE DATABASE "${controlsDatabaseName}"`);
  await pool.query(`CREATE DATABASE "${feesDatabaseName}"`);
  await pool.query(`CREATE DATABASE "${prebidDatabaseName}"`);
  await pool.query(`CREATE DATABASE "${cancellationDatabaseName}"`);
  await pool.query(`CREATE DATABASE "${withdrawalsDatabaseName}"`);
  await pool.query(`CREATE DATABASE "${staffAdminDatabaseName}"`);
  await pool.query(`CREATE DATABASE "${staffOptionalMfaDatabaseName}"`);
  await pool.query(`CREATE DATABASE "${staffActivityDatabaseName}"`);
  await pool.query(`CREATE DATABASE "${watchLaunchDatabaseName}"`);
  await pool.query(`CREATE DATABASE "${staffSetupDatabaseName}"`);
  await pool.query(`CREATE DATABASE "${overviewDatabaseName}"`);
  await pool.query(`CREATE DATABASE "${storageDatabaseName}"`);
  await pool.query(`CREATE DATABASE "${liveMonitorDatabaseName}"`);
  await pool.query(`CREATE DATABASE "${watchResultsDatabaseName}"`);
  await pool.query(`CREATE DATABASE "${lotSetupDatabaseName}"`);
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
const purchaseUrl = new URL(adminUrl);
const controlsUrl = new URL(adminUrl);
const feesUrl = new URL(adminUrl);
const prebidUrl = new URL(adminUrl);
const cancellationUrl = new URL(adminUrl);
cancellationUrl.pathname = `/${cancellationDatabaseName}`;
prebidUrl.pathname = `/${prebidDatabaseName}`;
feesUrl.pathname = `/${feesDatabaseName}`;
controlsUrl.pathname = `/${controlsDatabaseName}`;
const withdrawalsUrl = new URL(adminUrl);
const staffAdminUrl = new URL(adminUrl);
const staffOptionalMfaUrl = new URL(adminUrl);
const staffActivityUrl = new URL(adminUrl);
const watchLaunchUrl = new URL(adminUrl);
const staffSetupUrl = new URL(adminUrl);
const overviewUrl = new URL(adminUrl);
overviewUrl.pathname = `/${overviewDatabaseName}`;
// Files that run in parallel each get their own database so their fixtures
// cannot collide (counts, fee policies, notification batches).
const storageUrl = new URL(adminUrl);
storageUrl.pathname = `/${storageDatabaseName}`;
const liveMonitorUrl = new URL(adminUrl);
liveMonitorUrl.pathname = `/${liveMonitorDatabaseName}`;
const watchResultsUrl = new URL(adminUrl);
watchResultsUrl.pathname = `/${watchResultsDatabaseName}`;
const lotSetupUrl = new URL(adminUrl);
lotSetupUrl.pathname = `/${lotSetupDatabaseName}`;
staffSetupUrl.pathname = `/${staffSetupDatabaseName}`;
watchLaunchUrl.pathname = `/${watchLaunchDatabaseName}`;
staffActivityUrl.pathname = `/${staffActivityDatabaseName}`;
staffOptionalMfaUrl.pathname = `/${staffOptionalMfaDatabaseName}`;
staffAdminUrl.pathname = `/${staffAdminDatabaseName}`;
withdrawalsUrl.pathname = `/${withdrawalsDatabaseName}`;
purchaseUrl.pathname = `/${purchaseDatabaseName}`;
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
  PURCHASE_TEST_DATABASE_URL: purchaseUrl.href,
  WALLET_CONTROLS_TEST_DATABASE_URL: controlsUrl.href,
  AUCTION_FEES_TEST_DATABASE_URL: feesUrl.href,
  PREBID_TEST_DATABASE_URL: prebidUrl.href,
  CANCELLATION_TEST_DATABASE_URL: cancellationUrl.href,
  WITHDRAWALS_TEST_DATABASE_URL: withdrawalsUrl.href,
  STAFF_ADMIN_TEST_DATABASE_URL: staffAdminUrl.href,
  STAFF_OPTIONAL_MFA_TEST_DATABASE_URL: staffOptionalMfaUrl.href,
  STAFF_ACTIVITY_TEST_DATABASE_URL: staffActivityUrl.href,
  WATCH_LAUNCH_TEST_DATABASE_URL: watchLaunchUrl.href,
  STAFF_SETUP_TEST_DATABASE_URL: staffSetupUrl.href,
  OVERVIEW_TEST_DATABASE_URL: overviewUrl.href,
  STORAGE_TEST_DATABASE_URL: storageUrl.href,
  LIVE_MONITOR_TEST_DATABASE_URL: liveMonitorUrl.href,
  WATCH_RESULTS_TEST_DATABASE_URL: watchResultsUrl.href,
  LOT_SETUP_TEST_DATABASE_URL: lotSetupUrl.href,
  SEARCH_SYNC_TOKEN: randomBytes(32).toString('hex'),
  NODE_ENV: 'test',
  AUTH_MODE: 'local',
  SMTP_PASSWORD: '',
  RESEND_API_KEY: '',
  // Tests configure payment providers explicitly; never inherit a local key.
  PAYSTACK_SECRET_KEY: '',
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
if (status === 0)
  status = run(['scripts/database.mjs', 'migrate'], {
    ...env,
    DATABASE_URL: staffSetupUrl.href,
  });
if (status === 0)
  status = run(['scripts/database.mjs', 'migrate'], {
    ...env,
    DATABASE_URL: watchLaunchUrl.href,
  });
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
if (status === 0)
  status = run(['scripts/database.mjs', 'migrate'], {
    ...env,
    DATABASE_URL: purchaseUrl.href,
  });
for (const url of [
  overviewUrl,
  storageUrl,
  liveMonitorUrl,
  watchResultsUrl,
  lotSetupUrl,
  staffAdminUrl,
  staffOptionalMfaUrl,
  staffActivityUrl,
  controlsUrl,
  withdrawalsUrl,
  feesUrl,
  prebidUrl,
  cancellationUrl,
])
  if (status === 0)
    status = run(['scripts/database.mjs', 'migrate'], {
      ...env,
      DATABASE_URL: url.href,
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
