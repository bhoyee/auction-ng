import { afterEach, expect, it, vi } from 'vitest';
import { createSupportClient } from '../packages/api-client/src/support';
afterEach(() => vi.unstubAllGlobals());
it('renews staff authentication while replaying the exact approval body and key', async () => {
  const id = '22222222-2222-4222-8222-222222222222';
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response('{}', { status: 401 }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id,
          status: 'completed',
          feeKobo: 90000,
          reopened: true,
        }),
        { status: 200 },
      ),
    );
  vi.stubGlobal('fetch', fetcher);
  const renew = vi
    .fn()
    .mockResolvedValue({ accessToken: 'fresh-staff-token', deviceId: id });
  const client = createSupportClient(
    'http://localhost:4000',
    { accessToken: 'old-staff-token', deviceId: id },
    true,
    renew,
  );
  const input = {
    expectedStreamId: '1-0',
    expectedFeeKobo: 90000,
    reason: 'Approved after review',
    idempotencyKey: id,
  };
  expect((await client.approveCancellation(id, input)).status).toBe(
    'completed',
  );
  expect(renew).toHaveBeenCalledWith('old-staff-token');
  expect(fetcher.mock.calls[0]?.[0].pathname).toBe(
    '/admin/bid-cancellations/' + id + '/approve',
  );
  expect(fetcher.mock.calls[1]?.[1].body).toBe(fetcher.mock.calls[0]?.[1].body);
  expect(fetcher.mock.calls[1]?.[1].headers.Authorization).toBe(
    'Bearer fresh-staff-token',
  );
});
