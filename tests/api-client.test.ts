import { afterEach, expect, it, vi } from 'vitest';
import { getHealth } from '../packages/api-client/src/index';

afterEach(() => vi.unstubAllGlobals());

it('rejects non-success health responses', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('{}', { status: 503 })),
  );
  await expect(getHealth('http://localhost:4000')).rejects.toThrow('503');
});

it('rejects a malformed or unexpected health payload', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ status: 'ok', extra: true })),
  );
  await expect(getHealth('http://localhost:4000')).rejects.toThrow();
});
