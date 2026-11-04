import { afterEach, expect, it, vi } from 'vitest';
import { ApiError } from '../packages/api-client/src/auth';
import { createBidClient } from '../packages/api-client/src/bids';
import { bidFailureMessage } from '../apps/mobile/lib/bid-feedback';

afterEach(() => vi.unstubAllGlobals());
it('preserves the confirmed insufficient-funds code and offers a clear action', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ code: 'INSUFFICIENT_FUNDS' }), {
          status: 422,
        }),
    ),
  );
  const client = createBidClient('http://example.test', {
    accessToken: 'synthetic',
    deviceId: 'synthetic',
  });
  let failure: unknown;
  try {
    await client.prepare('synthetic-lot', {
      maxKobo: 50000,
      mode: 'direct',
      idempotencyKey: '4c2ae08a-6918-4e3f-95a2-519ad3ed21b7',
      feeVersion: 'v1',
    });
  } catch (error) {
    failure = error;
  }
  expect(failure).toMatchObject({ status: 422, code: 'INSUFFICIENT_FUNDS' });
  expect(bidFailureMessage(failure)).toContain('Insufficient funds. Top up');
});
it.each([401, 403, 409, 429])(
  'gives actionable feedback for HTTP %i',
  (status) => {
    const text = bidFailureMessage(new ApiError(status));
    expect(text.length).toBeGreaterThan(30);
    expect(text).not.toContain('Your bid was accepted');
  },
);
it('keeps an unknown network outcome explicitly uncertain and reuses the saved request', () => {
  expect(bidFailureMessage(new TypeError('Network request failed'))).toContain(
    'retry this same saved request',
  );
  expect(bidFailureMessage(new ApiError(503))).toContain(
    'could not be confirmed',
  );
});
it('does not mistake every 422 response for insufficient funds', () => {
  expect(bidFailureMessage(new ApiError(422))).not.toContain(
    'Insufficient funds',
  );
});
