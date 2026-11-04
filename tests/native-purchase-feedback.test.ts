import { afterEach, expect, it, vi } from 'vitest';
import type { PurchaseStatus } from '../packages/shared/src/purchase-schemas';
import { ApiError } from '../packages/api-client/src/auth';
import { createPurchaseClient } from '../packages/api-client/src/purchases';
import {
  latestPurchaseStatus,
  purchaseFeedback,
  purchaseFailureMessage,
} from '../apps/mobile/lib/purchase-feedback';

const pending: PurchaseStatus = {
  id: 'bb7bd1ef-adb8-4b72-a80e-f973d2a878bb',
  lotId: '4a9f3c10-6c22-4770-b5da-456e10510fc3',
  method: 'wallet',
  status: 'pending',
  priceKobo: 100000,
  taxKobo: 7500,
  totalKobo: 107500,
  amountKobo: 107500,
  processingFeeKobo: 0,
  expiresAt: '2026-11-04T22:00:00.000Z',
  invoiceId: null,
  authorizationUrl: null,
  fundsCredited: false,
};
afterEach(() => vi.unstubAllGlobals());
it('shows a paid purchase as a confirmed order', () => {
  expect(purchaseFeedback({ ...pending, status: 'paid' })).toMatchObject({
    tone: 'success',
    title: 'Purchase successful',
  });
});
it('never describes a pending hosted payment as a successful purchase', () => {
  expect(purchaseFeedback(pending)).toMatchObject({
    tone: 'warning',
    title: 'Payment confirmation pending',
  });
});
it.each(['expired', 'cancelled'] as const)(
  'shows %s reservations as unsuccessful',
  (status) => {
    expect(purchaseFeedback({ ...pending, status }).tone).toBe('error');
  },
);
it('distinguishes late wallet credit from buying the item', () => {
  const feedback = purchaseFeedback({
    ...pending,
    status: 'expired',
    fundsCredited: true,
  });
  expect(feedback.title).toBe('Funds added to your wallet');
  expect(feedback.message).toContain('item was not purchased');
});
it('does not regress a confirmed purchase to an earlier pending poll', () => {
  const paid = { ...pending, status: 'paid' as const };
  expect(latestPurchaseStatus(paid, pending)).toBe(paid);
  expect(latestPurchaseStatus(paid, { ...pending, status: 'expired' })).toBe(
    paid,
  );
  expect(latestPurchaseStatus(pending, paid)).toBe(paid);
});
it('does not replace the current purchase with a different checkout result', () => {
  expect(latestPurchaseStatus(pending, { ...pending, id: 'different' })).toBe(
    pending,
  );
});
it('retains a known late credit when a delayed poll has not caught up', () => {
  const credited = {
    ...pending,
    status: 'expired' as const,
    fundsCredited: true,
  };
  expect(
    latestPurchaseStatus(credited, { ...credited, fundsCredited: false }),
  ).toBe(credited);
});
it('keeps network errors uncertain and tells buyers to reuse their request', () => {
  expect(purchaseFailureMessage(new TypeError('network'))).toContain(
    'retry this same saved request',
  );
  expect(purchaseFailureMessage(new ApiError(422))).not.toContain(
    'Insufficient funds',
  );
});
it('preserves the typed insufficient-funds error from purchase checkout', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ code: 'INSUFFICIENT_FUNDS' }), {
          status: 422,
        }),
    ),
  );
  const client = createPurchaseClient('http://example.test', {
    accessToken: 'synthetic',
    deviceId: 'synthetic',
  });
  let failure: unknown;
  try {
    await client.confirm(pending.id);
  } catch (error) {
    failure = error;
  }
  expect(failure).toMatchObject({ status: 422, code: 'INSUFFICIENT_FUNDS' });
  expect(purchaseFailureMessage(failure)).toContain('Insufficient funds');
});
