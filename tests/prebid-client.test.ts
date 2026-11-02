import { afterEach, expect, it, vi } from 'vitest';
import { createPreBidClient } from '../packages/api-client/src/prebids';
afterEach(() => vi.unstubAllGlobals());
it('preserves the safe insufficient-funds code without exposing provider errors', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ code: 'INSUFFICIENT_FUNDS' }), {
      status: 422,
    }),
  );
  vi.stubGlobal('fetch', fetcher);
  const client = createPreBidClient('http://localhost:4000', {
    accessToken: 'test',
    deviceId: 'test',
  });
  await expect(client.read('test')).rejects.toMatchObject({
    status: 422,
    code: 'INSUFFICIENT_FUNDS',
  });
  fetcher.mockResolvedValue(
    new Response(JSON.stringify({ code: 'PRIVATE_PROVIDER_DETAIL' }), {
      status: 503,
    }),
  );
  await expect(client.read('test')).rejects.toMatchObject({
    status: 503,
    code: undefined,
  });
});
