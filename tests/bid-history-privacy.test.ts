import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { bidHistoryPrice } from '../apps/api/src/buyers/bid-history';
beforeAll(() => vi.stubEnv('PII_HASH_KEY', randomBytes(32).toString('base64')));
afterAll(() => vi.unstubAllEnvs());
it('shows only a recorded public price and a lot-scoped bidder alias', () => {
  const lotId = randomUUID();
  const bidderId = randomUUID();
  const result = {
    status: 'accepted',
    mode: 'automatic',
    isLeader: true,
    state: {
      startPriceKobo: 50000,
      currentPriceKobo: 50000,
      leader: { bidderId, maxKobo: 9999999 },
      endsAt: 12345,
    },
    serverTime: 10000,
  };
  const value = bidHistoryPrice(result, lotId);
  expect(value.currentPriceKobo).toBe(50000);
  expect(value.bidderLabel).toMatch(/^Buyer [A-F0-9]{6}$/);
  expect(JSON.stringify(value)).not.toMatch(/9999999|maxKobo|bidderId/);
  expect(bidHistoryPrice(result, randomUUID()).bidderLabel).not.toBe(
    value.bidderLabel,
  );
  expect(() => bidHistoryPrice({ maxKobo: 9999999 }, lotId)).toThrow();
  const losingRequest = bidHistoryPrice(
    {
      ...result,
      isLeader: false,
      state: { ...result.state, currentPriceKobo: 75000 },
    },
    lotId,
  );
  expect(losingRequest.currentPriceKobo).toBe(75000);
  expect(losingRequest.bidderLabel).toBe(value.bidderLabel);
  expect(Object.keys(losingRequest).sort()).toEqual([
    'bidderLabel',
    'currentPriceKobo',
  ]);
  expect(JSON.stringify(losingRequest)).not.toContain('9999999');
});
