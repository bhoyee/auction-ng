import { spawnSync } from 'node:child_process';
if (
  process.platform === 'win32' &&
  process.env.REDESIGN_NATIVE_BROWSER !== 'true'
) {
  await import('./run-redesign-docker.mjs');
} else {
  const pnpm = process.env.npm_execpath;
  if (!pnpm) throw new Error('Run pnpm test:redesign.');
  const env = {
    ...process.env,
    REDESIGN_DEMO: 'true',
    WEB_PERFORMANCE_CHECK: 'true',
    NEXT_PUBLIC_API_URL: 'http://localhost:4450',
    NEXT_PUBLIC_REALTIME_URL: 'http://localhost:4451',
    API_INTERNAL_URL: 'http://localhost:4450',
  };
  for (const args of [
    ['--filter', 'web', 'build'],
    ['exec', 'playwright', 'test', '--workers=1'],
  ]) {
    const result = spawnSync(process.execPath, [pnpm, ...args], {
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
}
