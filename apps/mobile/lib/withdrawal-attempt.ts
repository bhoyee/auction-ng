import type { WithdrawalStartInput } from '@auction-ng/shared';
import { ApiError } from '@auction-ng/api-client/auth';

export function withdrawalStartError(error: unknown) {
  if (error instanceof ApiError && error.status === 401)
    return 'Your password could not be verified. Check it and try again.';
  if (error instanceof ApiError && error.status === 429)
    return 'Too many attempts. Wait a little, then retry this same withdrawal.';
  return 'The request could not be confirmed. Retry this same withdrawal.';
}

/** Credentials may be corrected; the pending monetary instruction must not change. */
export function withdrawalAttempt(
  pending: Readonly<WithdrawalStartInput> | undefined,
  entered: WithdrawalStartInput,
): WithdrawalStartInput {
  return pending ? { ...pending, password: entered.password } : { ...entered };
}
