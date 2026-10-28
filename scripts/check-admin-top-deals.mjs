import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
if (existsSync('.env')) loadEnvFile('.env');
const requireApi = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const requireRoot = createRequire(new URL('../package.json', import.meta.url));
const pg = requireApi('pg');
const admin = new URL(
  process.env.TEST_DATABASE_ADMIN_URL ?? process.env.DATABASE_URL,
);
if (process.env.TEST_DATABASE_HOST)
  admin.hostname = process.env.TEST_DATABASE_HOST;
if (!['localhost', '127.0.0.1', 'postgres'].includes(admin.hostname))
  throw new Error('Use a local PostgreSQL server for these isolated checks.');
const pool = new pg.Pool({ connectionString: admin.href });
const env = {
  ...process.env,
  NODE_ENV: 'test',
  AUTH_MODE: 'local',
  BIDS_ENABLED: 'false',
  SMTP_PASSWORD: '',
  RESEND_API_KEY: '',
  DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  PII_HASH_KEY: randomBytes(32).toString('base64'),
};
function run(args, taskEnv = env) {
  const result = spawnSync(process.execPath, args, {
    env: taskEnv,
    stdio: 'inherit',
  });
  if (result.status !== 0)
    throw new Error(
      `Focused check failed (${result.status ?? 'spawn error'}).`,
    );
}
try {
  const staffOnly = process.argv.includes('--staff-only');
  const authOnly = process.argv.includes('--auth-only');
  const catalogueOnly = process.argv.includes('--catalogue-only');
  if (!staffOnly && !authOnly && !catalogueOnly)
    run([
      requireRoot.resolve('vitest/vitest.mjs'),
      'run',
      'tests/staff-crypto.test.ts',
      'tests/home-collections.test.ts',
      '--coverage.enabled=false',
    ]);
  const groups = catalogueOnly
    ? [['apps/api/tests/catalogue.test.ts']]
    : authOnly
      ? [
          ['tests/auth.test.ts', 'apps/api/tests/auth-security.test.ts'],
          ['apps/api/tests/top-deals.test.ts'],
        ]
      : staffOnly
        ? [['apps/api/tests/top-deals.test.ts']]
        : [
            ['apps/api/tests/catalogue.test.ts'],
            ['apps/api/tests/top-deals.test.ts'],
            ['tests/auth.test.ts', 'apps/api/tests/auth-security.test.ts'],
            [
              'tests/database.test.ts',
              '-t',
              'documents every deployed|has all 33',
            ],
          ];
  for (const files of groups) {
    const name = `auction_ng_test_${randomBytes(8).toString('hex')}`;
    await pool.query(`CREATE DATABASE "${name}"`);
    const url = new URL(admin);
    url.pathname = `/${name}`;
    const taskEnv = {
      ...env,
      DATABASE_URL: url.href,
      LEDGER_TEST_DATABASE_URL: url.href,
      AUTH_TEST_DATABASE_URL: url.href,
      TEST_DATABASE_URL: url.href,
      TOP_DEALS_TEST_DATABASE_URL: url.href,
    };
    run(['scripts/database.mjs', 'migrate'], taskEnv);
    if (files[0] === 'tests/database.test.ts')
      run(['scripts/database.mjs', 'docs'], taskEnv);
    run(
      [
        requireRoot.resolve('vitest/vitest.mjs'),
        'run',
        ...files,
        '--coverage.enabled=false',
      ],
      taskEnv,
    );
  }
  console.log(
    'Focused admin, staff-auth, curation and schema checks passed. Test databases retained; no application data deleted.',
  );
} finally {
  await pool.end();
}
