import { ApiError } from '@auction-ng/api-client/auth';

export function bidFailureMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === 'INSUFFICIENT_FUNDS')
      return 'Insufficient funds. Top up your available wallet balance to cover your bid and fees, then retry this saved request.';
    if (error.status === 401)
      return 'Your session could not be verified. Sign in again before retrying this saved request.';
    if (error.status === 403)
      return 'Bidding is not available for this account. Check your account verification or contact support.';
    if (error.status === 429)
      return 'Too many bid attempts. Wait a moment, then retry this saved request.';
    if (error.status === 409)
      return 'This bid could not be accepted. Check the latest price and auction status before retrying your saved request.';
  }
  return 'Your bid could not be confirmed. Check your connection and retry this same saved request; do not submit another bid until its status is confirmed.';
}
