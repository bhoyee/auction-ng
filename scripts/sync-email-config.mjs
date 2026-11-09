import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { syncEmailConfig } from './email-config.ts';

if (!existsSync('.env')) throw new Error('Create the private .env file first.');
if (existsSync('.env.demo')) {
  const source = await readFile('.env', 'utf8');
  const target = await readFile('.env.demo', 'utf8');
  await writeFile('.env.demo', syncEmailConfig(source, target));
  console.log(
    'Email settings synced to .env.demo. Demo storage and encryption settings are unchanged.',
  );
} else {
  console.log(
    'No .env.demo exists yet. A future demo seed will inherit email settings from .env.',
  );
}
