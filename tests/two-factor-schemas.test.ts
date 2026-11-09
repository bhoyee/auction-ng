import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  securityStartSchema,
  securityFinishSchema,
  twoFactorProofSchema,
} from '../packages/shared/src/two-factor-schemas';
import {
  verifyCodeSchema,
  resetPasswordSchema,
} from '../packages/shared/src/auth-schemas';
import { withdrawalConfirmSchema } from '../packages/shared/src/withdrawal-schemas';
it('accepts only strict authenticator/recovery proofs and normalises recovery codes', () => {
  expect(
    twoFactorProofSchema.parse({
      method: 'recovery',
      code: 'aaaa-bbbb-cccc-dddd-eeee-ffff',
    }).code,
  ).toBe('AAAA-BBBB-CCCC-DDDD-EEEE-FFFF');
  for (const value of [
    { method: 'authenticator', code: '12345' },
    { method: 'authenticator', code: '123456', userId: randomUUID() },
    { method: 'recovery', code: 'ABC' },
    { method: 'email', code: '123456' },
  ])
    expect(twoFactorProofSchema.safeParse(value).success).toBe(false);
});
it('binds new passwords to password-change challenges only and rejects client policy overrides', () => {
  expect(
    securityStartSchema.safeParse({
      purpose: 'change-password',
      password: 'current',
    }).success,
  ).toBe(false);
  expect(
    securityStartSchema.safeParse({
      purpose: 'enable',
      password: 'current',
      newPassword: 'Synthetic password',
    }).success,
  ).toBe(false);
  expect(
    securityFinishSchema.safeParse({ id: randomUUID(), mandatory: false })
      .success,
  ).toBe(false);
});
it('carries the same factor contract through login, recovery and withdrawal confirmation', () => {
  const factor = { method: 'authenticator', code: '123456' };
  const login = {
    challengeId: randomUUID(),
    code: '654321',
    deviceId: randomUUID(),
    client: 'mobile',
    factor,
  };
  expect(verifyCodeSchema.parse(login).factor).toEqual(factor);
  expect(
    resetPasswordSchema.parse({
      ...login,
      newPassword: 'Synthetic replacement password',
    }).factor,
  ).toEqual(factor);
  expect(
    withdrawalConfirmSchema.parse({ id: randomUUID(), code: '654321', factor })
      .factor,
  ).toEqual(factor);
});
