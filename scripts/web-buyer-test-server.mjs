import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
if (existsSync(new URL('.env', root)))
  loadEnvFile(fileURLToPath(new URL('.env', root)));
const apiRequire = createRequire(new URL('apps/api/package.json', root));
const { default: pg } = await import(
  pathToFileURL(apiRequire.resolve('pg')).href
);
if (!process.env.DATABASE_URL)
  throw new Error('Local test database connection is required.');
const url = new URL(
  process.env.TEST_DATABASE_ADMIN_URL ?? process.env.DATABASE_URL,
);
const name = `auction_ng_test_${randomBytes(8).toString('hex')}`;
const pool = new pg.Pool({ connectionString: url.href });
await pool.query(`CREATE DATABASE "${name}"`);
await pool.end();
url.pathname = `/${name}`;
const env = {
  ...process.env,
  DATABASE_URL: url.href,
  NODE_ENV: 'test',
  TSX_TSCONFIG_PATH: fileURLToPath(new URL('apps/api/tsconfig.json', root)),
  DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  PII_HASH_KEY: randomBytes(32).toString('base64'),
  PAYSTACK_SECRET_KEY: '',
  BIDS_ENABLED: 'true',
  BID_MAINTENANCE_TOKEN: randomBytes(32).toString('hex'),
};
const migrated = spawnSync(
  process.execPath,
  ['scripts/database.mjs', 'migrate'],
  { cwd: fileURLToPath(root), env, stdio: 'pipe' },
);
if (migrated.status !== 0)
  throw new Error('Isolated browser database migration failed.');
const child = spawn(
  process.execPath,
  [
    '--import',
    pathToFileURL(apiRequire.resolve('tsx')).href,
    'apps/api/tests/web-buyer-server.ts',
  ],
  {
    cwd: fileURLToPath(root),
    env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  },
);
// Framework startup diagnostics contain routes and service names, never OTPs.
child.stdout.on('data', (chunk) => process.stderr.write(chunk));
child.stderr.on('data', (chunk) => process.stderr.write(chunk));
child.on('message', (message) => {
  if (process.connected) process.send?.(message);
});
process.on('message', (message) => {
  if (child.connected) child.send(message);
});
process.on('disconnect', () => {
  if (child.connected) child.send({ command: 'stop' });
});
child.on('exit', (code) => process.exit(code ?? 1));
