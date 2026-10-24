import { expect, it } from 'vitest';
import { decryptPii, encryptPii, hashPii } from '../apps/api/src/security/pii';

it('encrypts with random nonces, authenticates the field purpose and detects tampering', () => {
  const encrypted = encryptPii('+2348000000001', 'phone');
  expect(decryptPii(encrypted, 'phone')).toBe('+2348000000001');
  expect(encryptPii('+2348000000001', 'phone').equals(encrypted)).toBe(false);
  expect(() => decryptPii(encrypted, 'bvn')).toThrow();
  const tampered = Buffer.from(encrypted);
  tampered[tampered.length - 1] = (tampered.at(-1) ?? 0) ^ 1;
  expect(() => decryptPii(tampered, 'phone')).toThrow();
  expect(hashPii('value', 'phone')).toBe(hashPii('value', 'phone'));
  expect(hashPii('value', 'phone')).not.toBe(hashPii('value', 'bvn'));
});
