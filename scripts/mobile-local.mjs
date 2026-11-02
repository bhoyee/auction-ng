import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import network from './mobile-network.cjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const envPath = path.join(root, '.env');
const config = fs.existsSync(envPath)
  ? parseEnv(fs.readFileSync(envPath, 'utf8'))
  : {};
const address = network.selectMobileAddress(
  os.networkInterfaces(),
  process.env.MOBILE_BIND_ADDRESS || config.MOBILE_BIND_ADDRESS,
);
const port = (key, fallback) => {
  const value = Number(process.env[key] || config[key] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535)
    throw Error(`Invalid ${key}.`);
  return value;
};
const ports = {
  api: port('API_HOST_PORT', 4000),
  realtime: port('REALTIME_HOST_PORT', 4001),
  web: port('WEB_HOST_PORT', 3300),
};
const run = (command, args, env) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      stdio: 'inherit',
      shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(Error(`${command} failed. Check Docker Desktop and retry.`)),
    );
  });
const capture = promisify(execFile);
const compose = [];
if (fs.existsSync(envPath)) compose.push('--env-file', '.env');
const demo = fs.existsSync(path.join(root, '.env.demo'));
if (demo) compose.push('--env-file', '.env.demo');
compose.push('-f', 'docker-compose.yml');
if (demo) compose.push('-f', 'infra/docker/demo.compose.yml');
compose.push('-f', 'infra/docker/mobile.compose.yml');
try {
  const env = { ...process.env, MOBILE_BIND_ADDRESS: address };
  console.log(
    `Preparing Auction NG for phones on ${address}. No database/cache/admin ports are exposed.`,
  );
  await run('docker', ['compose', ...compose, 'config', '--quiet'], env);
  await run(
    'docker',
    [
      'compose',
      ...compose,
      'up',
      '-d',
      '--no-build',
      'postgres',
      'redis',
      'mailpit',
      'meilisearch',
    ],
    env,
  );
  const result = await capture(
    'docker',
    ['compose', ...compose, 'ps', '--all', '--quiet', 'postgres'],
    { cwd: root, env, timeout: 15000 },
  );
  const databaseId = result.stdout.trim();
  if (!/^[a-f0-9]{12,64}$/.test(databaseId))
    throw Error('The local PostgreSQL container could not be identified.');
  let databaseReady = false;
  for (let attempt = 0; attempt < 180; attempt++) {
    const state = await capture(
      'docker',
      [
        'inspect',
        '--format',
        '{{.State.Status}}|{{.State.Health.Status}}',
        databaseId,
      ],
      { cwd: root, env, timeout: 10000 },
    );
    if (state.stdout.trim() === 'running|healthy') {
      databaseReady = true;
      break;
    }
    if (/exited|dead/.test(state.stdout))
      throw Error(
        'PostgreSQL stopped. Inspect its startup logs before retrying.',
      );
    if (attempt % 10 === 0)
      console.log(
        'Waiting for PostgreSQL readiness/recovery. Existing data is preserved.',
      );
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (!databaseReady)
    throw Error(
      'PostgreSQL is not ready yet. Let recovery finish, then retry. Do not remove its data volume.',
    );
  await run(
    'docker',
    [
      'compose',
      ...compose,
      'up',
      '-d',
      '--no-build',
      'web',
      'api',
      'realtime',
      'worker',
      'meilisearch',
    ],
    env,
  );
  fs.writeFileSync(
    path.join(root, '.env.mobile.local'),
    `# Generated public LAN addresses for local development only. Never used for release export.\nEXPO_PUBLIC_API_URL=http://${address}:${ports.api}\nEXPO_PUBLIC_REALTIME_URL=http://${address}:${ports.realtime}\nEXPO_PUBLIC_WEB_URL=http://${address}:${ports.web}\n`,
  );
  console.log(
    `Public development addresses saved to ignored .env.mobile.local.\nOn your phone, check http://${address}:${ports.api}/health.\nThen restart Expo: pnpm --filter mobile start --clear --port 8081\nBoth devices must use the same trusted Wi-Fi. Allow these app ports on Windows Private networks if prompted.`,
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Mobile connection setup failed.',
  );
  process.exitCode = 1;
}
