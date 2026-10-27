import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { loadEnvFile } from 'node:process';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
if (existsSync(new URL('.env', root)))
  loadEnvFile(fileURLToPath(new URL('.env', root)));
const apiRequire = createRequire(new URL('apps/api/package.json', root));
if (!process.env.DATABASE_URL)
  throw new Error('Local test database connection is required.');
let env;
if (process.env.REDESIGN_DEMO === 'true') {
  const config = `.tools/demo-${randomUUID()}.env`;
  const seeded = spawnSync(process.execPath, ['scripts/seed-demo.mjs'], {
    cwd: fileURLToPath(root),
    env: { ...process.env, NODE_ENV: 'test', DEMO_CONFIG_PATH: config },
    stdio: 'inherit',
    windowsHide: true,
  });
  if (seeded.status !== 0)
    throw new Error(
      'Populated isolated demo setup failed; existing data is preserved.',
    );
  const settings = parseEnv(await readFile(new URL(config, root), 'utf8'));
  const url = new URL(settings.DEMO_DATABASE_URL);
  url.hostname = 'localhost';
  env = {
    ...process.env,
    ...settings,
    DATABASE_URL: url.href,
    BID_NAMESPACE: settings.DEMO_BID_NAMESPACE,
    MEILISEARCH_INDEX: settings.DEMO_SEARCH_INDEX,
    BID_MAINTENANCE_TOKEN: settings.DEMO_MAINTENANCE_TOKEN,
  };
} else {
  const { default: pg } = await import(
    pathToFileURL(apiRequire.resolve('pg')).href
  );
  const url = new URL(
    process.env.TEST_DATABASE_ADMIN_URL ?? process.env.DATABASE_URL,
  );
  const name = `auction_ng_test_${randomBytes(8).toString('hex')}`;
  const pool = new pg.Pool({ connectionString: url.href });
  try {
    await pool.query(`CREATE DATABASE "${name}"`);
  } finally {
    await pool.end();
  }
  url.pathname = `/${name}`;
  env = {
    ...process.env,
    DATABASE_URL: url.href,
    DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    PII_HASH_KEY: randomBytes(32).toString('base64'),
    BID_MAINTENANCE_TOKEN: randomBytes(32).toString('hex'),
  };
  const migrated = spawnSync(
    process.execPath,
    ['scripts/database.mjs', 'migrate'],
    { cwd: fileURLToPath(root), env, stdio: 'pipe' },
  );
  if (migrated.status !== 0)
    throw new Error('Isolated browser database migration failed.');
}
env = {
  ...env,
  NODE_ENV: 'test',
  AUTH_MODE: 'local',
  SMTP_PASSWORD: '',
  RESEND_API_KEY: '',
  TSX_TSCONFIG_PATH: fileURLToPath(new URL('apps/api/tsconfig.json', root)),
  PAYSTACK_SECRET_KEY: '',
  BIDS_ENABLED: 'true',
};
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
    windowsHide: true,
  },
);
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
