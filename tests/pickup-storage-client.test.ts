import { afterEach, expect, it, vi } from 'vitest';
import { createPickupStorageClient } from '../packages/api-client/src/pickup-storage';
const id = '550e8400-e29b-41d4-a716-446655440000';
const key = '550e8400-e29b-41d4-a716-446655440001';
const payment = {
  id,
  caseId: id,
  method: 'wallet',
  status: 'pending',
  storageKobo: 100000,
  feeKobo: 0,
  amountKobo: 100000,
  expiresAt: '2026-11-16T10:10:00.000Z',
  createdAt: '2026-11-16T10:00:00.000Z',
  checkoutUrl: null,
};
afterEach(() => vi.unstubAllGlobals());
it('preserves the safe policy-setup error code without exposing arbitrary server details', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'PICKUP_STORAGE_POLICY_REQUIRED',
            message: 'private internal details',
          }),
          { status: 409 },
        ),
      ),
  );
  const client = createPickupStorageClient('http://localhost:4000', {
    accessToken: 'synthetic',
    deviceId: 'device',
  });
  await expect(
    client.ready({
      lineIds: [id],
      idempotencyKey: key,
      reason: 'Physically ready',
    }),
  ).rejects.toMatchObject({
    status: 409,
    code: 'PICKUP_STORAGE_POLICY_REQUIRED',
  });
});
it('sends owner credentials and consent keys without accepting browser-supplied charge amounts', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(payment), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  const client = createPickupStorageClient('http://localhost:4000', {
    accessToken: 'synthetic',
    deviceId: 'synthetic-device',
  });
  await client.confirm({ paymentId: id, idempotencyKey: key, consent: true });
  const [url, options] = fetch.mock.calls[0] ?? [];
  expect(String(url)).toBe('http://localhost:4000/pickup/storage/confirm');
  expect(options.headers.Authorization).toBe('Bearer synthetic');
  expect(JSON.parse(options.body)).toEqual({
    paymentId: id,
    idempotencyKey: key,
    consent: true,
  });
  await expect(
    client.confirm({
      paymentId: id,
      idempotencyKey: key,
      consent: true,
      amountKobo: 1,
    } as Parameters<typeof client.confirm>[0]),
  ).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('checks pending checkout recovery and rejects malformed payment responses', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('null', { status: 200 }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ ...payment, amountKobo: '1000' }), {
        status: 200,
      }),
    );
  vi.stubGlobal('fetch', fetch);
  const client = createPickupStorageClient('http://localhost:4000', {
    accessToken: 'synthetic',
    deviceId: 'device',
  });
  expect(await client.pendingPayment(id)).toBeNull();
  await expect(client.payment(id)).rejects.toThrow();
});
