import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const publicKeys = [
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_REALTIME_URL',
  'EXPO_PUBLIC_WEB_URL',
  'EXPO_PUBLIC_EAS_PROJECT_ID',
];
const env = { ...process.env };
for (const filename of ['.env']) {
  const target = path.join(root, filename);
  if (!fs.existsSync(target)) continue;
  const parsed = parseEnv(fs.readFileSync(target, 'utf8'));
  for (const key of publicKeys)
    if (!env[key] && parsed[key]) env[key] = parsed[key];
}
const args = process.argv.slice(2);
const command = args[0] ?? 'start';
if (command === 'export') {
  for (const key of ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_REALTIME_URL'])
    if (env[key] && !env[key].startsWith('https:'))
      throw Error('Published mobile endpoint ' + key + ' must use HTTPS.');
}
const exe = path.join(root, 'apps/mobile/node_modules/expo/bin/cli');
const child = spawn(
  process.execPath,
  [exe, ...(args.length ? args : ['start', '--lan'])],
  { cwd: path.join(root, 'apps/mobile'), env, stdio: 'inherit' },
);
child.on('error', () => {
  console.error('Expo could not start. Run pnpm install first.');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
