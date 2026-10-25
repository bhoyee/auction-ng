import { readFile, appendFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const path = new URL('../.env', import.meta.url);
let content;
try {
  content = await readFile(path, 'utf8');
} catch {
  throw new Error('Copy .env.example to .env first.');
}
const setting = [...content.matchAll(/^BID_MAINTENANCE_TOKEN=(.*)$/gm)].at(-1);
if (setting?.[1]?.trim()) {
  if (setting[1].trim().length < 32)
    throw new Error('Bid maintenance token must have at least 32 characters.');
  console.log('Bid maintenance token is already configured.');
} else {
  await appendFile(
    path,
    `${content.endsWith('\n') ? '' : '\n'}BID_MAINTENANCE_TOKEN=${randomBytes(32).toString('hex')}\n`,
  );
  console.log('Bid maintenance token saved to the ignored .env file.');
}
console.log(
  'Bidding has not been enabled. Keep BIDS_ENABLED=false pending money/bid review and later settlement work.',
);
