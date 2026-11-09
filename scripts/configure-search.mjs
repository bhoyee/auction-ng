import { readFile, appendFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const path = new URL('../.env', import.meta.url);
let content;
try {
  content = await readFile(path, 'utf8');
} catch {
  throw new Error('Copy .env.example to .env first.');
}
const setting = [...content.matchAll(/^SEARCH_SYNC_TOKEN=(.*)$/gm)].at(-1);
if (setting?.[1]?.trim()) {
  if (setting[1].trim().length < 32)
    throw new Error(
      'The configured search token must have at least 32 characters.',
    );
  console.log(
    'Search token is already configured. No secret was displayed or changed.',
  );
} else {
  const token = randomBytes(32).toString('hex');
  // Appending preserves all existing credentials and gives dotenv the final value.
  await appendFile(
    path,
    `${content.endsWith('\n') ? '' : '\n'}SEARCH_SYNC_TOKEN=${token}\n`,
  );
  console.log(
    'Search token saved to the ignored .env file. Restart API and worker.',
  );
}
