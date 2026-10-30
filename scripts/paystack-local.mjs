import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
const key = parseEnv(readFileSync('.env', 'utf8')).PAYSTACK_SECRET_KEY ?? '';
if (!/^sk_test_[A-Za-z0-9]+$/.test(key))
  throw Error(
    'Set PAYSTACK_SECRET_KEY to your Paystack TEST secret in local .env. Live keys are not allowed.',
  );
const demo = existsSync('.env.demo');
const args = demo
  ? [
      'compose',
      '--env-file',
      '.env.demo',
      '-f',
      'docker-compose.yml',
      '-f',
      'infra/docker/demo.compose.yml',
    ]
  : ['compose', '--env-file', '.env'];
const result = spawnSync(
  'docker',
  [...args, 'up', '-d', '--no-build', '--force-recreate', '--no-deps', 'api'],
  {
    env: { ...process.env, PAYSTACK_SECRET_KEY: key },
    stdio: 'inherit',
    windowsHide: true,
  },
);
if (result.error || result.status !== 0) {
  console.error('Paystack API configuration failed. Check Docker Desktop.');
  process.exitCode = 1;
} else
  console.log(
    'API reloaded with the test key from .env. No secret values were printed or copied.',
  );
