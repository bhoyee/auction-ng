import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const envFile = new URL('.env', root);
if (existsSync(envFile)) loadEnvFile(fileURLToPath(envFile));
const apiRequire = createRequire(new URL('apps/api/package.json', root));
const action = process.argv[2];
let args;
if (action === 'migrate' || action === 'generate') {
  args = [
    apiRequire.resolve('prisma/build/index.js'),
    ...(action === 'migrate' ? ['migrate', 'deploy'] : ['generate']),
  ];
} else if (action === 'seed' || action === 'docs') {
  args = [
    '--import',
    pathToFileURL(apiRequire.resolve('tsx')).href,
    fileURLToPath(
      new URL(
        `apps/api/prisma/${action === 'seed' ? 'seed' : 'document-schema'}.ts`,
        root,
      ),
    ),
  ];
} else throw new Error('Unknown database command.');
const result = spawnSync(process.execPath, args, {
  cwd: fileURLToPath(new URL('apps/api', root)),
  env: process.env,
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
if (action === 'docs' && result.status === 0) {
  const require = createRequire(new URL('package.json', root));
  const format = spawnSync(
    process.execPath,
    [
      require.resolve('prettier/bin/prettier.cjs'),
      '--write',
      fileURLToPath(new URL('docs/specs/database-schema.md', root)),
    ],
    { cwd: fileURLToPath(root), env: process.env, stdio: 'inherit' },
  );
  if (format.error) throw format.error;
  process.exitCode = format.status ?? 1;
}
