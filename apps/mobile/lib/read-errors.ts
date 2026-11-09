import { ApiError } from '@auction-ng/api-client/auth';

export function readErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 429)
      return 'Too many updates were requested. Updates will retry automatically shortly.';
    if (error.status === 401)
      return 'Your sign-in session could not be verified. Sign in again to continue.';
    if (error.status === 403)
      return 'This information is not available for this account.';
    if (error.status === 404)
      return 'The requested information could not be found. Retry or reopen this screen.';
    if (error.status === 400)
      return 'This update request could not be accepted. Reopen this screen and retry.';
    if (error.status >= 500)
      return 'The server could not load this information. Please retry shortly.';
    return 'This update could not be completed. Please retry.';
  }
  if (
    error instanceof Error &&
    ['ZodError', 'SyntaxError'].includes(error.name)
  )
    return 'The server returned an unexpected response. Please retry.';
  if (
    error instanceof Error &&
    ['TimeoutError', 'AbortError'].includes(error.name)
  )
    return 'The server took too long to respond. Updates will retry automatically.';
  return 'Could not reach the server. Check your connection and try again.';
}
