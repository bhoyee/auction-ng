import { readFile } from 'node:fs/promises';
import { parseArgs, parseEnv, promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { createConnection } from 'node:net';
import { assertDemoDatabase } from '../apps/api/prisma/demo-catalogue.ts';
import { LedgerService } from '../apps/api/src/ledger/ledger-service.ts';
import { BidRuntimeRecovery } from '../apps/api/src/bids/runtime-recovery.ts';

const { values } = parseArgs({
  options: {
    apply: { type: 'boolean', default: false },
    fingerprint: { type: 'string' },
    key: { type: 'string' },
    operator: { type: 'string' },
    reason: { type: 'string' },
  },
});
if (process.env.NODE_ENV === 'production')
  throw Error(
    'This operator command is restricted to the local demo environment.',
  );
const root = new URL('../', import.meta.url);
const base = parseEnv(await readFile(new URL('.env', root), 'utf8'));
const demo = parseEnv(await readFile(new URL('.env.demo', root), 'utf8'));
const settings = { ...base, ...demo, ...process.env };
const url = new URL(demo.DEMO_DATABASE_URL ?? '');
assertDemoDatabase(url.href, process.env.NODE_ENV);
const prefix = demo.DEMO_BID_NAMESPACE;
if (prefix !== `auction:demo:${url.pathname.slice(1)}:`)
  throw Error('Demo database and namespace do not match.');
url.hostname = '127.0.0.1';
process.env.DATA_ENCRYPTION_KEY = settings.DATA_ENCRYPTION_KEY;
process.env.PII_HASH_KEY = settings.PII_HASH_KEY;
const require = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const { createClient } =
  require('redis') as typeof import('../apps/api/node_modules/redis');
const redis = createClient({
  url: 'redis://127.0.0.1:6379',
  socket: { reconnectStrategy: false, connectTimeout: 5000 },
});
redis.on('error', () => {});
const ledger = new LedgerService(url.href);
const capture = promisify(execFile);
async function requireClosedPort(port: number) {
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(2000);
    socket.once('connect', () => {
      socket.destroy();
      reject(Error('API/realtime ports must be closed for offline recovery.'));
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(Error('Offline port checks could not be confirmed.'));
    });
    socket.once('error', (error: NodeJS.ErrnoException) => {
      socket.destroy();
      if (error.code === 'ECONNREFUSED') resolve();
      else reject(Error('Offline port checks could not be confirmed.'));
    });
  });
}
async function assertOffline() {
  const result = await capture(
    'docker',
    [
      'ps',
      '--filter',
      'label=com.docker.compose.project=auction-ng',
      '--format',
      '{{.Label "com.docker.compose.service"}}',
    ],
    { timeout: 10000 },
  );
  const running = result.stdout.trim().split(/\r?\n/);
  if (
    running.some((service) => ['api', 'worker', 'realtime'].includes(service))
  )
    throw Error(
      'Stop only Auction NG api, worker and realtime before applying the reviewed recovery.',
    );
  for (const [key, fallback] of [
    ['API_HOST_PORT', 4000],
    ['REALTIME_HOST_PORT', 4001],
  ] as const) {
    const port = Number(settings[key] || fallback);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw Error('Invalid local service port.');
    await requireClosedPort(port);
  }
}
try {
  await redis.connect();
  const recovery = new BidRuntimeRecovery(ledger, redis, prefix, {
    assertOffline,
  });
  const result = values.apply
    ? await recovery.apply({
        idempotencyKey: values.key,
        reportFingerprint: values.fingerprint,
        operator: values.operator,
        reason: values.reason,
      })
    : await recovery.audit();
  console.log(JSON.stringify(result, null, 2));
  console.log(
    values.apply
      ? 'Recovery receipt committed. No ledger entries or reservations were changed. Start the reviewed application build, then run pnpm mobile:check.'
      : 'READ ONLY dry run. Applying requires offline services, this exact fingerprint, a new UUID key, an operator name and an audit reason. No state changed.',
  );
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : 'Recovery failed; keep the bid runtime paused.',
  );
  process.exitCode = 1;
} finally {
  if (redis.isOpen) await redis.quit();
  await ledger.close();
}
