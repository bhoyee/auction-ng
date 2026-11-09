import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

if (existsSync('.env')) loadEnvFile('.env');
const connection = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1'].includes(connection.hostname))
  throw new Error('Browser tests require the local Compose database.');
connection.hostname = '127.0.0.1';
connection.port = '5432';
await mkdir('test-results', { recursive: true });
const env = {
  ...process.env,
  DATABASE_URL: connection.href,
  REDIS_URL: 'redis://redis:6379',
  MEILISEARCH_URL: 'http://meilisearch:7700',
  PAYSTACK_SECRET_KEY: '',
};
const lockHash = createHash('sha256')
  .update(readFileSync('pnpm-lock.yaml'))
  .digest('hex');
const installed = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--entrypoint',
    'node',
    'auction-ng-local',
    '-e',
    "process.stdout.write(require('node:crypto').createHash('sha256').update(require('node:fs').readFileSync('/workspace/pnpm-lock.yaml')).digest('hex'))",
  ],
  { encoding: 'utf8', windowsHide: true },
);
const commands = [
  ...(installed.status === 0 && installed.stdout.trim() === lockHash
    ? []
    : [['compose', 'build', 'web']]),
  [
    'build',
    '--file',
    'infra/docker/browser.Dockerfile',
    '--tag',
    'auction-ng-browser-tests',
    '.',
  ],
  [
    'run',
    '--rm',
    '--init',
    '--ipc=host',
    '--network',
    'auction-ng_default',
    '--mount',
    `type=bind,source=${resolve('test-results')},target=/workspace/test-results`,
    '--env',
    'DATABASE_URL',
    '--env',
    'REDIS_URL',
    '--env',
    'MEILISEARCH_URL',
    '--env',
    'MEILI_MASTER_KEY',
    '--env',
    'PAYSTACK_SECRET_KEY',
    'auction-ng-browser-tests',
  ],
];
console.log(
  'Running the production browser audit in Linux Docker, matching CI. Existing application containers and data are retained.',
);
for (const args of commands) {
  const result = spawnSync('docker', args, {
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
