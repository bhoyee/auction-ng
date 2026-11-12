import { afterEach, expect, it, vi } from 'vitest';
import { createBidCancellationClient } from '../packages/api-client/src/bid-cancellation';
import {
  readLotHistory,
  readMyLotBids,
} from '../packages/api-client/src/bid-history';
import { ApiError } from '../packages/api-client/src/auth';

afterEach(() => vi.unstubAllGlobals());

const lotId = '33333333-3333-4333-8333-333333333333';
const deviceId = '44444444-4444-4444-8444-444444444444';
const state = {
  commitment: {
    maxKobo: 1250000,
    automatic: false,
    createdAt: '2026-11-12T08:00:00.000Z',
  },
  canRequest: true,
  blocked: false,
  feeBps: 1000,
  feeConsent: false,
  conversation: null,
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });

it('reads bid-cancellation state from the same support endpoint with buyer headers', async () => {
  const fetcher = vi.fn().mockResolvedValue(json(state));
  vi.stubGlobal('fetch', fetcher);
  const client = createBidCancellationClient('http://localhost:4000', {
    accessToken: 'buyer-token',
    deviceId,
  });
  expect(await client.bidCancellation(lotId)).toMatchObject({
    canRequest: true,
    commitment: { maxKobo: 1250000 },
  });
  const [url, init] = fetcher.mock.calls[0] ?? [];
  expect(url.pathname).toBe(`/support/lots/${lotId}/bid-cancellation`);
  expect(init.method).toBe('GET');
  expect(init.headers.Authorization).toBe('Bearer buyer-token');
  expect(init.headers['X-Device-Id']).toBe(deviceId);
  expect(init.redirect).toBe('error');
});

it('renews once on 401 and replays the exact validated request body', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({}, 401))
    .mockResolvedValueOnce(json(state));
  vi.stubGlobal('fetch', fetcher);
  const renew = vi
    .fn()
    .mockResolvedValue({ accessToken: 'fresh-token', deviceId });
  const client = createBidCancellationClient(
    'http://localhost:4000',
    { accessToken: 'old-token', deviceId },
    renew,
  );
  const input = {
    reason: 'I entered the wrong amount by mistake.',
    acknowledged: true as const,
    feeAcknowledged: true as const,
    idempotencyKey: deviceId,
  };
  await client.requestBidCancellation(lotId, input);
  expect(renew).toHaveBeenCalledWith('old-token');
  expect(fetcher.mock.calls[0]?.[1].method).toBe('POST');
  expect(fetcher.mock.calls[1]?.[1].body).toBe(fetcher.mock.calls[0]?.[1].body);
  expect(JSON.parse(fetcher.mock.calls[1]?.[1].body)).toEqual(input);
  expect(fetcher.mock.calls[1]?.[1].headers.Authorization).toBe(
    'Bearer fresh-token',
  );
});

it('rejects an invalid cancellation request before any network call', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const client = createBidCancellationClient('http://localhost:4000', {
    accessToken: 'buyer-token',
    deviceId,
  });
  await expect(
    client.requestBidCancellation(lotId, {
      reason: 'short',
      acknowledged: true,
      feeAcknowledged: true,
      idempotencyKey: deviceId,
    }),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

it('reads public bid history with the page cursor and no credentials', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(json({ items: [], nextCursor: null }));
  vi.stubGlobal('fetch', fetcher);
  await readLotHistory('http://localhost:4000', lotId, {
    limit: 10,
    cursor: 'abc',
  });
  const [url, init] = fetcher.mock.calls[0] ?? [];
  expect(url.pathname).toBe(`/lots/${lotId}/bid-history`);
  expect(url.searchParams.get('limit')).toBe('10');
  expect(url.searchParams.get('cursor')).toBe('abc');
  expect(init.headers.Authorization).toBeUndefined();
});

it('reads the buyer’s own bids with credentials and maps errors to ApiError', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ items: [], nextCursor: null }))
    .mockResolvedValueOnce(json({}, 403));
  vi.stubGlobal('fetch', fetcher);
  const credentials = { accessToken: 'buyer-token', deviceId };
  await readMyLotBids('http://localhost:4000', credentials, lotId, {
    limit: 5,
  });
  const [url, init] = fetcher.mock.calls[0] ?? [];
  expect(url.pathname).toBe(`/buyers/lots/${lotId}/my-bids`);
  expect(url.searchParams.get('limit')).toBe('5');
  expect(init.headers.Authorization).toBe('Bearer buyer-token');
  expect(init.headers['X-Device-Id']).toBe(deviceId);
  await expect(
    readMyLotBids('http://localhost:4000', credentials, lotId),
  ).rejects.toEqual(new ApiError(403));
});
