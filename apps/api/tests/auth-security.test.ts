import { expect, it } from 'vitest';
import { Reflector } from '@nestjs/core';
import { HttpException, type ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '../src/auth/auth-guard';
import { AuthService } from '../src/auth/auth-service';
import { MailpitEmailProvider } from '../src/auth/email-provider';

// Keep guard fixtures separate from the public email login path, which cannot issue staff sessions.
it('permits only explicitly allowed roles and denies missing identities', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  function handler() {}
  class Controller {}
  Reflect.defineMetadata('auth:roles', ['admin', 'finance'], handler);
  const context = (role: string | null) =>
    ({
      getHandler: () => handler,
      getClass: () => Controller,
      switchToHttp: () => ({
        getRequest: () => (role ? { identity: { user: { role } } } : {}),
      }),
    }) as unknown as ExecutionContext;
  expect(guard.canActivate(context('admin'))).toBe(true);
  expect(guard.canActivate(context('finance'))).toBe(true);
  expect(() => guard.canActivate(context('buyer'))).toThrow();
  expect(() => guard.canActivate(context('support'))).toThrow();
  expect(() => guard.canActivate(context(null))).toThrow();
});
it('restricts the Mailpit adapter to a local development inbox', () => {
  expect(() => new MailpitEmailProvider('https://external.example')).toThrow();
  expect(
    () => new MailpitEmailProvider('http://user:password@localhost:8025'),
  ).toThrow();
  expect(() => new MailpitEmailProvider('http://localhost:8025')).not.toThrow();
});
it('disables email sign-in without the explicit local mode', async () => {
  const service = new AuthService({
    databaseUrl: process.env.AUTH_TEST_DATABASE_URL,
    mode: 'disabled',
  });
  try {
    await expect(
      service.requestCode(
        {
          email: 'buyer@example.test',
          deviceId: '11111111-1111-4111-8111-111111111111',
          client: 'mobile',
        },
        'local',
      ),
    ).rejects.toBeInstanceOf(HttpException);
  } finally {
    await service.close();
  }
});
