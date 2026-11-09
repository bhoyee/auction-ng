import { expect, it } from 'vitest';
import { HttpException, type ArgumentsHost } from '@nestjs/common';
import { SafeExceptionFilter } from '../src/auth/safe-exception-filter';
function response(code: string, status = 409) {
  let text = '';
  const res = {
    statusCode: 0,
    setHeader: () => {},
    end: (value: string) => {
      text = value;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;
  new SafeExceptionFilter().catch(
    new HttpException({ code, message: 'Private database details' }, status),
    host,
  );
  return JSON.parse(text) as { code?: string; message: string };
}
it('exposes only allowlisted storage codes and keeps internal messages private', () => {
  expect(response('PICKUP_STORAGE_POLICY_REQUIRED').code).toBe(
    'PICKUP_STORAGE_POLICY_REQUIRED',
  );
  expect(response('PICKUP_STORAGE_NOT_ELIGIBLE').code).toBe(
    'PICKUP_STORAGE_NOT_ELIGIBLE',
  );
  expect(response('PRIVATE_DATABASE_ERROR').code).toBeUndefined();
  expect(response('PICKUP_STORAGE_POLICY_REQUIRED').message).not.toContain(
    'Private database details',
  );
});
it('does not attach storage codes to unrelated failures or change authenticator responses', () => {
  expect(response('PICKUP_STORAGE_POLICY_REQUIRED', 500).code).toBeUndefined();
  expect(response('TWO_FACTOR_REQUIRED', 422)).toMatchObject({
    code: 'TWO_FACTOR_REQUIRED',
    message: 'Enter your authenticator or recovery code.',
  });
});
