import { expect, it } from 'vitest';
import { ApiError } from '../packages/api-client/src/auth';
import { verifyLoginStep } from '../apps/mobile/lib/login-verification';

it('finishes only after the server returns a verified session', async () => {
  const session = { accessToken: 'synthetic-test-token' };
  await expect(verifyLoginStep(async () => session)).resolves.toEqual({
    step: 'complete',
    session,
  });
});
it('opens the authenticator step without creating a session when required', async () => {
  await expect(
    verifyLoginStep(async () => {
      throw new ApiError(401, 'TWO_FACTOR_REQUIRED');
    }),
  ).resolves.toEqual({ step: 'authenticator', invalid: false });
});
it('keeps invalid authenticator attempts on the second-factor step', async () => {
  await expect(
    verifyLoginStep(async () => {
      throw new ApiError(401, 'TWO_FACTOR_INVALID');
    }),
  ).resolves.toEqual({ step: 'authenticator', invalid: true });
});
it('does not advance to 2FA for an invalid email code or throttled request', async () => {
  for (const status of [401, 429]) {
    const error = new ApiError(status);
    await expect(
      verifyLoginStep(async () => {
        throw error;
      }),
    ).rejects.toBe(error);
  }
});
