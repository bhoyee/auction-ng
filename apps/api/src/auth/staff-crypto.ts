import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function derive(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      salt,
      32,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}
export async function hashStaffPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt32768r8p3$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyStaffPassword(password: string, encoded: string) {
  const [algorithm, salt, hex] = encoded.split('$');
  if (
    algorithm !== 'scrypt32768r8p3' ||
    !salt ||
    !/^[a-f0-9]{32}$/.test(salt) ||
    !hex ||
    !/^[a-f0-9]{64}$/.test(hex)
  )
    return false;
  return timingSafeEqual(await derive(password, salt), Buffer.from(hex, 'hex'));
}
export function newTotpSecret() {
  const bytes = randomBytes(20);
  let bits = 0,
    value = 0,
    result = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return result;
}
function decode(secret: string) {
  if (!/^[A-Z2-7]{32}$/.test(secret))
    throw new Error('Invalid authenticator secret.');
  let bits = 0,
    value = 0;
  const bytes: number[] = [];
  for (const char of secret) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
export function totpCode(secret: string, counter: number) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decode(secret)).update(bytes).digest();
  const offset = (digest.at(-1) ?? 0) & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, '0');
}
export function verifyTotp(
  secret: string,
  code: string,
  now: number,
  lastCounter: bigint | null = null,
) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const counter of [current - 1, current, current + 1]) {
    if (counter < 0 || (lastCounter !== null && BigInt(counter) <= lastCounter))
      continue;
    if (
      timingSafeEqual(Buffer.from(totpCode(secret, counter)), Buffer.from(code))
    )
      return BigInt(counter);
  }
  return null;
}
