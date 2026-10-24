import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';

function key(name: 'DATA_ENCRYPTION_KEY' | 'PII_HASH_KEY'): Buffer {
  const value = process.env[name];
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value))
    throw new Error(`${name} must be a base64-encoded 32-byte key.`);
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== 32)
    throw new Error(`${name} must decode to 32 bytes.`);
  if (process.env.DATA_ENCRYPTION_KEY === process.env.PII_HASH_KEY)
    throw new Error('Use separate encryption and lookup keys.');
  return decoded;
}

export function encryptPii(
  value: string,
  purpose: string,
): Buffer<ArrayBuffer> {
  const nonce = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    key('DATA_ENCRYPTION_KEY'),
    nonce,
  );
  cipher.setAAD(Buffer.from(purpose));
  const ciphertext = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([
    Buffer.from([1]),
    nonce,
    cipher.getAuthTag(),
    ciphertext,
  ]);
}

export function decryptPii(value: Buffer, purpose: string): string {
  if (value.length < 29 || value[0] !== 1)
    throw new Error('Unsupported encrypted value.');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key('DATA_ENCRYPTION_KEY'),
    value.subarray(1, 13),
  );
  decipher.setAAD(Buffer.from(purpose));
  decipher.setAuthTag(value.subarray(13, 29));
  return Buffer.concat([
    decipher.update(value.subarray(29)),
    decipher.final(),
  ]).toString('utf8');
}

export function hashPii(value: string, purpose: string): string {
  return createHmac('sha256', key('PII_HASH_KEY'))
    .update(`${purpose}\0${value}`)
    .digest('hex');
}
