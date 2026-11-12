// Fast local development: Docker runs only Postgres, Redis, Meilisearch and
// Mailpit; the apps run on this PC in watch mode, so a saved change shows in
// seconds instead of rebuilding images. Uses the same demo database, Redis
// namespace and ports as the Docker demo stack.
//
//   pnpm dev:local            web, admin, api, realtime, worker
//   pnpm dev:local web admin  only the named apps
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';

const root = new URL('../', import.meta.url);
const read = (name) => {
  const file = new URL(name, root);
  return existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
};
// Same precedence as `docker compose --env-file .env --env-file .env.demo`.
const env = { ...read('.env'), ...read('.env.demo') };
for (const key of [
  'DEMO_DATABASE_URL',
  'DEMO_BID_NAMESPACE',
  'DEMO_SEARCH_INDEX',
])
  if (!env[key]) {
    console.error(
      `${key} is missing from .env.demo. Run pnpm db:seed:demo first.`,
    );
    process.exit(1);
  }
// Mirror infra/docker/demo.compose.yml.
Object.assign(env, {
  DATABASE_URL: env.DEMO_DATABASE_URL,
  BID_NAMESPACE: env.DEMO_BID_NAMESPACE,
  MEILISEARCH_INDEX: env.DEMO_SEARCH_INDEX,
  CATALOGUE_CACHE_NAMESPACE: env.DEMO_SEARCH_INDEX,
  ...(env.DEMO_MAINTENANCE_TOKEN
    ? { BID_MAINTENANCE_TOKEN: env.DEMO_MAINTENANCE_TOKEN }
    : {}),
  BIDS_ENABLED: 'true',
  DEPLOYMENT_ENV: 'local',
});
// Docker-internal service names only resolve inside Docker; on this PC the
// same services are published on localhost.
const dockerHosts = [
  'postgres',
  'redis',
  'meilisearch',
  'mailpit',
  'api',
  'realtime',
];
for (const [key, value] of Object.entries(env)) {
  if (!value || !value.includes('://')) continue;
  for (const host of dockerHosts)
    for (const marker of [
      `@${host}:`,
      `://${host}:`,
      `@${host}/`,
      `://${host}/`,
    ])
      if (value.includes(marker))
        env[key] = value.replace(marker, marker.replace(host, 'localhost'));
}
env.SUPPORT_EMAIL ||= 'hello@lotvanta.ng';
env.CONTACT_INBOX_EMAIL ||= env.SUPPORT_EMAIL;
env.STAFF_WEB_ORIGINS ||= 'http://localhost:3301';
env.PAYMENT_RETURN_ORIGIN ||= 'http://localhost:3300';

const apps = {
  api: { dir: 'apps/api', node: ['--import', 'tsx', '--watch', 'src/main.ts'] },
  realtime: {
    dir: 'apps/realtime',
    node: ['--import', 'tsx', '--watch', 'src/main.ts'],
  },
  worker: {
    dir: 'apps/worker',
    node: ['--import', 'tsx', '--watch', 'src/main.ts'],
  },
  web: { dir: 'apps/web', next: 3300 },
  admin: { dir: 'apps/admin', next: 3301 },
};
const chosen = process.argv.slice(2).length
  ? process.argv.slice(2)
  : Object.keys(apps);
for (const name of chosen)
  if (!apps[name]) {
    console.error(
      `Unknown app "${name}". Choose from: ${Object.keys(apps).join(', ')}`,
    );
    process.exit(1);
  }

// Free the ports held by the production-style containers (they are only
// stopped, not removed; `docker start` brings them back).
const containers = chosen.map((name) => `auction-ng-${name}-1`);
const running =
  spawnSync('docker', ['ps', '--format', '{{.Names}}'], {
    encoding: 'utf8',
  }).stdout?.split('\n') ?? [];
const toStop = containers.filter((name) => running.includes(name));
if (toStop.length) {
  console.log(`Stopping Docker app containers: ${toStop.join(', ')}`);
  spawnSync('docker', ['stop', ...toStop], { stdio: 'inherit' });
}

const colours = { api: 36, realtime: 35, worker: 33, web: 32, admin: 34 };
const children = [];
// The worker drives closing and deliveries through the API, so start it only
// once the API answers; otherwise its first calls fail and it stops.
async function apiReady() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch('http://localhost:4000/health')).ok) return;
    } catch {
      // Still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  console.log(
    'API did not answer within two minutes; starting the worker anyway.',
  );
}
const order = [
  ...chosen.filter((name) => name !== 'worker'),
  ...chosen.filter((name) => name === 'worker'),
];
for (const name of order) {
  if (name === 'worker' && chosen.includes('api')) await apiReady();
  const app = apps[name];
  const cwd = new URL(app.dir + '/', root);
  const args = app.next
    ? [
        createRequire(new URL('package.json', cwd)).resolve(
          'next/dist/bin/next',
        ),
        'dev',
        '--port',
        String(app.next),
      ]
    : app.node;
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env, FORCE_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tag = `\x1b[${colours[name]}m[${name}]\x1b[0m `;
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) =>
      process.stdout.write(
        chunk
          .toString()
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => tag + line)
          .join('\n') + '\n',
      ),
    );
  child.on('exit', (code) => console.log(`${tag}exited (${code})`));
  children.push(child);
}
console.log(
  `\nRunning ${chosen.join(', ')}. Web http://localhost:3300 · Admin http://localhost:3301 · API http://localhost:4000. Ctrl+C stops all.\n`,
);
const stop = () => {
  for (const child of children) child.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
