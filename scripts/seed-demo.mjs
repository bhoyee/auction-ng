import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const configPath = process.env.DEMO_CONFIG_PATH || '.env.demo';
if (
  configPath !== '.env.demo' &&
  !/^\.tools\/demo-[a-f0-9-]+\.env$/.test(configPath)
)
  throw new Error(
    'Use .env.demo or a generated private .tools/demo-*.env file.',
  );
if (existsSync(new URL('.env', root)))
  loadEnvFile(fileURLToPath(new URL('.env', root)));
if (process.env.NODE_ENV === 'production')
  throw new Error('Demo seeding is disabled in production.');
const require = createRequire(new URL('apps/api/package.json', root));
const { default: pg } = await import(pathToFileURL(require.resolve('pg')).href);
const url = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1'].includes(url.hostname))
  throw new Error('Run demo setup against local Docker only.');
const name = `auction_ng_demo_${randomBytes(8).toString('hex')}`;
const pool = new pg.Pool({
  connectionString: url.href,
  connectionTimeoutMillis: 5000,
});
try {
  await pool.query(`CREATE DATABASE "${name}"`);
} finally {
  await pool.end();
}
url.pathname = `/${name}`;
const namespace = `auction:demo:${name}:`;
const env = {
  ...process.env,
  DATABASE_URL: url.href,
  BID_NAMESPACE: namespace,
  TSX_TSCONFIG_PATH: fileURLToPath(new URL('apps/api/tsconfig.json', root)),
  MEILISEARCH_INDEX: name,
  DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  PII_HASH_KEY: randomBytes(32).toString('base64'),
};
for (const args of [
  ['scripts/database.mjs', 'migrate'],
  [
    '--import',
    pathToFileURL(require.resolve('tsx')).href,
    'apps/api/prisma/seed-marketplace.ts',
  ],
]) {
  const result = spawnSync(process.execPath, args, {
    cwd: fileURLToPath(root),
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      'Isolated demo setup failed. Existing databases are preserved.',
    );
}
const dockerUrl = new URL(url);
dockerUrl.hostname = 'postgres';
dockerUrl.port = '5432';
const mainEnv = existsSync(new URL('.env', root))
  ? await readFile(new URL('.env', root), 'utf8')
  : '';
await mkdir(new URL('.tools/', root), { recursive: true });
await writeFile(
  new URL(configPath, root),
  `${mainEnv}\n# Generated private demo configuration. Do not commit.\nDATA_ENCRYPTION_KEY=${env.DATA_ENCRYPTION_KEY}\nPII_HASH_KEY=${env.PII_HASH_KEY}\nDEMO_DATABASE_URL=${dockerUrl.href}\nDEMO_BID_NAMESPACE=${namespace}\nDEMO_SEARCH_INDEX=${name}\nDEMO_MAINTENANCE_TOKEN=${randomBytes(32).toString('hex')}\n`,
);
console.log(
  'Demo ready: 120 photographed open lots, 12 categories, three sample hubs, funded synthetic bids and watchlists.',
);
console.log(
  'Existing data is unchanged. A fresh retained demo database is created on every run; 20 lots each close in 6 hours, 12 hours, 24 hours, 3 days, 4 days and 5 days, staggered by one minute.',
);
console.log(
  'Start the demo with: docker compose --env-file .env.demo -f docker-compose.yml -f infra/docker/demo.compose.yml up -d --build --wait',
);
