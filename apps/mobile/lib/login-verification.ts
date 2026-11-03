import { ApiError } from '@auction-ng/api-client/auth';

// Only the server can decide whether the verified email challenge needs 2FA.
export async function verifyLoginStep<T>(verify: () => Promise<T>) {
  try {
    return { step: 'complete' as const, session: await verify() };
  } catch (error) {
    if (error instanceof ApiError && error.code === 'TWO_FACTOR_REQUIRED') {
      return { step: 'authenticator' as const, invalid: false };
    }
    if (error instanceof ApiError && error.code === 'TWO_FACTOR_INVALID') {
      return { step: 'authenticator' as const, invalid: true };
    }
    throw error;
  }
}
