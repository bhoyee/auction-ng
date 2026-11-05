import type { WithdrawalStartInput } from '@auction-ng/shared';
import { ApiError } from '@auction-ng/api-client/auth';

export function withdrawalConfirmationError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === 'TWO_FACTOR_INVALID')
      return 'Enter a new authenticator code. Each code can be used once; wait for the next code if you already used it to sign in.';
    if (error.code === 'TWO_FACTOR_REQUIRED')
      return 'Enter your authenticator code as well as the email code.';
    if (error.status === 400)
      return 'Check the six-digit withdrawal email code. If it has expired or too many attempts were made, start again.';
    if (error.status === 401 || error.status === 403)
      return 'Your withdrawal session could not be verified. Sign in again and check withdrawal history before starting another request.';
    if (error.status === 409)
      return 'The withdrawal could not be confirmed. Check your available balance, daily limit and verified bank account before retrying.';
    if (error.status === 429)
      return 'Too many attempts. Wait before retrying this same withdrawal.';
    if (error.status >= 500)
      return 'The server could not confirm the result. Check withdrawal history, then retry this same withdrawal if needed.';
  }
  if (error instanceof Error && error.name === 'ZodError')
    return 'Check that both required codes contain exactly six digits. If they do, check withdrawal history before retrying this same withdrawal.';
  return 'The confirmation result could not be checked. Check your connection and withdrawal history, then retry this same withdrawal.';
}

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
