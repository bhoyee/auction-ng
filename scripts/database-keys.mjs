import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../.env', import.meta.url);
let text = readFileSync(
  existsSync(file) ? file : new URL('../.env.example', import.meta.url),
  'utf8',
);
for (const name of ['DATA_ENCRYPTION_KEY', 'PII_HASH_KEY']) {
  const pattern = new RegExp(`^${name}=(.*)$`, 'm');
  const value = text.match(pattern)?.[1]?.trim();
  if (value && value !== '""' && value !== "''") continue;
  const line = `${name}=${randomBytes(32).toString('base64')}`;
  text = pattern.test(text)
    ? text.replace(pattern, line)
    : `${text}\n${line}\n`;
}
writeFileSync(file, text, { mode: 0o600 });
console.log(
  'Local database encryption keys configured. Existing keys were preserved; no values were printed.',
);
