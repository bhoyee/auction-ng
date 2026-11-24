// A real staff API on a throwaway local database, for browser tests only.
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
if (existsSync(new URL('.env', root)))
  loadEnvFile(fileURLToPath(new URL('.env', root)));
const apiRequire = createRequire(new URL('apps/api/package.json', root));
const { default: pg } = await import(
  pathToFileURL(apiRequire.resolve('pg')).href
);
const url = new URL(
  process.env.TEST_DATABASE_ADMIN_URL ?? process.env.DATABASE_URL ?? '',
);
if (!['localhost', '127.0.0.1'].includes(url.hostname))
  throw new Error('Batch browser tests need a local database.');
const name = `auction_ng_test_${randomBytes(8).toString('hex')}`;
const pool = new pg.Pool({ connectionString: url.href });
await pool.query(`CREATE DATABASE "${name}"`);
url.pathname = `/${name}`;
const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: url.href,
  DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  PII_HASH_KEY: randomBytes(32).toString('base64'),
};
const migrated = spawnSync(
  process.execPath,
  ['scripts/database.mjs', 'migrate'],
  {
    cwd: fileURLToPath(root),
    env,
    stdio: ['ignore', 'ignore', 'inherit'],
    windowsHide: true,
  },
);
if (migrated.status !== 0) throw new Error('Migration failed.');
const child = spawn(
  process.execPath,
  [
    '--import',
    pathToFileURL(apiRequire.resolve('tsx')).href,
    'tests/batches-server.ts',
  ],
  {
    cwd: fileURLToPath(new URL('apps/api', root)),
    env,
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    windowsHide: true,
  },
);
child.on('message', (m) => process.send?.(m));
process.on('message', (m) => child.connected && child.send(m));
process.on('disconnect', () => child.kill());
child.on('exit', async () => {
  await pool.query(`DROP DATABASE "${name}" WITH (FORCE)`).catch(() => {});
  await pool.end();
  process.exit();
});
