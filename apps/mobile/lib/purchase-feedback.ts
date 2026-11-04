import { ApiError } from '@auction-ng/api-client/auth';
import type { PurchaseStatus } from '@auction-ng/shared';

export function purchaseFeedback(
  current: Pick<PurchaseStatus, 'status' | 'fundsCredited'>,
) {
  if (current.status === 'paid')
    return {
      tone: 'success' as const,
      title: 'Purchase successful',
      message:
        'Your payment is confirmed. Your invoice and collection details are ready in Awaiting pickup.',
    };
  if (current.fundsCredited)
    return {
      tone: 'warning' as const,
      title: 'Funds added to your wallet',
      message:
        'Your payment arrived after the reservation ended. It was credited to your wallet; this item was not purchased.',
    };
  if (current.status === 'pending')
    return {
      tone: 'warning' as const,
      title: 'Payment confirmation pending',
      message:
        'Your purchase is not confirmed yet. We will update this screen when payment is verified. Do not pay again.',
    };
  return {
    tone: 'error' as const,
    title:
      current.status === 'expired'
        ? 'Reservation expired'
        : 'Reservation cancelled',
    message:
      'This reservation did not complete a purchase. Any payment confirmed after it ended will be credited to your wallet.',
  };
}
export function latestPurchaseStatus(
  result?: PurchaseStatus,
  polled?: PurchaseStatus,
) {
  if (!result || !polled || result.id !== polled.id) return result;
  if (result.status === 'paid') return result;
  if (
    (polled.status === 'pending' && result.status !== 'pending') ||
    (result.fundsCredited && !polled.fundsCredited)
  )
    return result;
  return polled;
}
export function purchaseFailureMessage(error: unknown) {
  if (error instanceof ApiError && error.code === 'INSUFFICIENT_FUNDS')
    return 'Insufficient funds. Top up your available wallet balance to cover the purchase total, then retry this saved purchase.';
  return 'Your purchase could not be confirmed. Check your connection and retry this same saved request, or check your orders. Do not make another payment until its status is confirmed.';
}
