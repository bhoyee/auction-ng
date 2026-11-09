import { expect, it } from 'vitest';
import { purchaseReview } from '../apps/mobile/lib/purchase-review';

it('keeps the reviewed method and amounts when retrying after price or selection changes', () => {
  const saved = {
    idempotencyKey: 'b5901bd8-623b-49e1-90b5-bcf66a59d462',
    method: 'bank_transfer' as const,
    acceptedPriceKobo: 1000000,
    acceptedTaxKobo: 75000,
    acceptedProcessingFeeKobo: 10000,
    acceptedTotalKobo: 1085000,
  };
  expect(purchaseReview(2000000, 'local_card', saved)).toEqual({
    method: 'bank_transfer',
    price: 1000000,
    tax: 75000,
    processing: 10000,
    total: 1085000,
  });
});

it('does not add processing charges to a new wallet purchase', () => {
  expect(purchaseReview(1000000, 'wallet')).toEqual({
    method: 'wallet',
    price: 1000000,
    tax: 75000,
    processing: 0,
    total: 1075000,
  });
});
