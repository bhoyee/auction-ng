import {
  calculateFixedPrice,
  quotePurchasePayment,
  type PurchaseInput,
} from '@auction-ng/shared';

// An uncertain checkout must retain the exact amounts the buyer approved.
export function purchaseReview(
  price: number,
  method: PurchaseInput['method'],
  pending?: PurchaseInput,
) {
  if (pending)
    return {
      method: pending.method,
      price: pending.acceptedPriceKobo,
      tax: pending.acceptedTaxKobo,
      processing: pending.acceptedProcessingFeeKobo,
      total: pending.acceptedTotalKobo,
    };
  const base = calculateFixedPrice(price);
  const payment =
    method === 'wallet'
      ? undefined
      : quotePurchasePayment(base.totalKobo, method);
  return {
    method,
    price,
    tax: base.taxKobo,
    processing: payment?.feeKobo ?? 0,
    total: payment?.amountKobo ?? base.totalKobo,
  };
}
