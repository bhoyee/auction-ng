import { expect, it } from 'vitest';
import {
  hashStaffPassword,
  verifyStaffPassword,
  newTotpSecret,
  totpCode,
  verifyTotp,
} from '../apps/api/src/auth/staff-crypto';
const vectorSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
it.each([
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
  [20000000000, '353130'],
])('matches RFC 6238 SHA-1 six-digit vector at %s seconds', (time, code) => {
  expect(totpCode(vectorSecret, Math.floor(Number(time) / 30))).toBe(code);
});
it('accepts only the clock window and rejects previously consumed authenticator codes', () => {
  const now = 1234567890000;
  const counter = Math.floor(now / 30000);
  const code = totpCode(vectorSecret, counter);
  expect(verifyTotp(vectorSecret, code, now)).toBe(BigInt(counter));
  expect(verifyTotp(vectorSecret, code, now, BigInt(counter))).toBeNull();
  expect(verifyTotp(vectorSecret, code, now + 90000)).toBeNull();
  expect(verifyTotp(vectorSecret, 'not-a-code', now)).toBeNull();
});
it('generates independent Google Authenticator-compatible setup secrets', () => {
  const secret = newTotpSecret();
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  expect(newTotpSecret()).not.toBe(secret);
});
it('salts and verifies staff passwords without storing plaintext', async () => {
  const password = 'synthetic test password only';
  const encoded = await hashStaffPassword(password);
  expect(encoded).not.toContain(password);
  expect(await hashStaffPassword(password)).not.toBe(encoded);
  expect(await verifyStaffPassword(password, encoded)).toBe(true);
  expect(await verifyStaffPassword('wrong password', encoded)).toBe(false);
  expect(await verifyStaffPassword(password, 'bad-format')).toBe(false);
});
