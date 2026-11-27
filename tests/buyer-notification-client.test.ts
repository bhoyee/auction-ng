import { afterEach, expect, it, vi } from 'vitest';
import { createBuyerNotificationClient } from '../packages/api-client/src/buyer-notifications';
import { createBuyerClient } from '../packages/api-client/src/buyers';
import { ApiError } from '../packages/api-client/src/auth';
afterEach(() => vi.unstubAllGlobals());
const id = '12565678-1234-4234-8234-123456789012';
const credentials = { accessToken: 'x'.repeat(43), deviceId: id };
it('the lightweight client preserves notification reads, pagination, acknowledgement and auth headers', async () => {
  const fetcher = vi.fn(
    async (url: URL) =>
      new Response(
        JSON.stringify(
          url.pathname.endsWith('/summary')
            ? { unread: 2, awaitingPickup: 1 }
            : url.pathname.endsWith('/read')
              ? { updated: 1 }
              : { items: [], nextCursor: null },
        ),
      ),
  );
  vi.stubGlobal('fetch', fetcher);
  for (const client of [
    createBuyerNotificationClient('https://api.example.test', credentials),
    createBuyerClient('https://api.example.test', credentials),
  ]) {
    expect(await client.notificationSummary()).toEqual({
      unread: 2,
      awaitingPickup: 1,
    });
    expect(await client.notifications({ limit: 10 })).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(await client.bidderMessages({ limit: 1 })).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(await client.readNotifications([id])).toEqual({ updated: 1 });
  }
  expect(fetcher).toHaveBeenCalledWith(
    new URL('https://api.example.test/buyers/notifications?limit=10'),
    expect.objectContaining({
      cache: 'no-store',
      redirect: 'error',
      headers: expect.objectContaining({
        Authorization: 'Bearer ' + credentials.accessToken,
        'X-Device-Id': id,
      }),
    }),
  );
  expect(fetcher).toHaveBeenCalledWith(
    new URL('https://api.example.test/buyers/notifications/read'),
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ ids: [id] }),
    }),
  );
});
it('keeps rejection and untrusted notification-link validation intact', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('{}', { status: 401 })),
  );
  const client = createBuyerNotificationClient(
    'https://api.example.test',
    credentials,
  );
  await expect(client.notificationSummary()).rejects.toBeInstanceOf(ApiError);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id,
              title: 'Unsafe',
              href: 'https://untrusted.example',
              createdAt: new Date().toISOString(),
              readAt: null,
            },
          ],
          nextCursor: null,
        }),
      ),
    ),
  );
  await expect(client.notifications()).rejects.toThrow();
});
