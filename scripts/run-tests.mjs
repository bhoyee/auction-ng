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
if (!/^auction_ng_test_[a-f0-9]{16}$/.test(databaseName))
  throw new Error('Invalid test database name.');
const pool = new pg.Pool({
  connectionString: adminUrl.href,
  connectionTimeoutMillis: 5000,
});
try {
  await pool.query(`CREATE DATABASE "${databaseName}"`);
} finally {
  await pool.end();
}
adminUrl.pathname = `/${databaseName}`;
const env = {
  ...process.env,
  DATABASE_URL: adminUrl.href,
  TEST_DATABASE_URL: adminUrl.href,
  NODE_ENV: 'test',
  DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  PII_HASH_KEY: randomBytes(32).toString('base64'),
};
function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: fileURLToPath(root),
    env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
// Test databases are isolated and deliberately retained; never reset user data.
console.log(`Using new isolated test database ${databaseName}.`);
let status = run(['scripts/database.mjs', 'generate']);
if (status === 0) status = run(['scripts/database.mjs', 'migrate']);
if (status === 0) {
  const require = createRequire(new URL('package.json', root));
  status = run([require.resolve('vitest/vitest.mjs'), 'run']);
}
process.exitCode = status;
