import { afterEach, expect, it, vi } from 'vitest';
import { purgeDeletedBatches } from '../packages/api-client/src/analytics';

afterEach(() => vi.unstubAllGlobals());
it('sends cleanup only to the authenticated private worker endpoint', async () => {
  const request = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ removed: 2 })));
  vi.stubGlobal('fetch', request);
  expect(await purgeDeletedBatches('http://api:4000', 't'.repeat(32))).toEqual({
    removed: 2,
  });
  expect(request).toHaveBeenCalledWith(
    new URL('http://api:4000/internal/batches/cleanup-deleted'),
    expect.objectContaining({
      method: 'POST',
      redirect: 'error',
      body: '{}',
      headers: {
        Authorization: 'Bearer ' + 't'.repeat(32),
        'Content-Type': 'application/json',
      },
    }),
  );
  for (const url of [
    'https://example.test',
    'http://api:4000/elsewhere',
    'http://user:password@api:4000',
    'http://api:4000/?key=bad',
  ])
    await expect(purgeDeletedBatches(url, 't'.repeat(32))).rejects.toThrow();
  await expect(
    purgeDeletedBatches('http://api:4000', 'short'),
  ).rejects.toThrow();
  expect(request).toHaveBeenCalledTimes(1);
});
it('retries refused cleanup and rejects malformed responses', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('{}', { status: 503 })),
  );
  await expect(
    purgeDeletedBatches('http://api:4000', 't'.repeat(32)),
  ).rejects.toThrow('retry');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ removed: -1 }))),
  );
  await expect(
    purgeDeletedBatches('http://api:4000', 't'.repeat(32)),
  ).rejects.toThrow();
});
