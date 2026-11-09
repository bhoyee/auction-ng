import { randomBytes } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { PaystackProvider } from '../src/payments/paystack-provider';
const testSecret = () => `sk_test_${randomBytes(16).toString('hex')}`;
it('accepts Paystack alphanumeric bank codes instead of failing the entire bank page', async () => {
  const provider = new PaystackProvider(
    testSecret(),
    async () =>
      new Response(
        JSON.stringify({
          status: true,
          data: [
            {
              name: 'Microfinance bank',
              code: 'MFB51116M',
              active: true,
              is_deleted: false,
              country: 'Nigeria',
              currency: 'NGN',
            },
            {
              name: 'Transfer network',
              code: 'C08',
              active: true,
              is_deleted: false,
              country: 'Nigeria',
              currency: 'NGN',
            },
          ],
          meta: { next: null },
        }),
      ),
  );
  expect(
    (await provider.listBanks({ limit: 50 })).items.map((bank) => bank.code),
  ).toEqual(['MFB51116M', 'C08']);
});
it('lists Nigerian NGN banks with bounded cursor pagination and never starts a payment', async () => {
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({
          status: true,
          data: [
            {
              name: 'Test verification bank',
              code: '007',
              active: true,
              is_deleted: false,
              country: 'Nigeria',
              currency: 'NGN',
            },
            {
              name: 'Inactive bank',
              code: '008',
              active: false,
              is_deleted: false,
              country: 'Nigeria',
              currency: 'NGN',
            },
          ],
          meta: { next: 'YmFuazoxNjk=' },
        }),
      ),
  );
  const provider = new PaystackProvider(testSecret(), fetcher);
  const page = await provider.listBanks({ limit: 50 });
  expect(page.items).toEqual([{ name: 'Test verification bank', code: '007' }]);
  expect(page.nextCursor).not.toContain('=');
  await provider.listBanks({ limit: 20, cursor: page.nextCursor ?? undefined });
  const call = fetcher.mock.calls[1];
  const url = new URL(String(call?.[0]));
  expect(url.origin + url.pathname).toBe('https://api.paystack.co/bank');
  expect(url.searchParams.get('country')).toBe('nigeria');
  expect(url.searchParams.get('currency')).toBe('NGN');
  expect(url.searchParams.get('perPage')).toBe('20');
  expect(url.searchParams.get('next')).toBe('YmFuazoxNjk=');
  expect(call?.[1]?.method).toBe('GET');
  expect(call?.[1]?.body).toBeUndefined();
});
it('rejects invalid cursors and never invents banks when the provider fails', async () => {
  const fetcher = vi.fn<typeof fetch>(
    async () => new Response('{}', { status: 503 }),
  );
  const provider = new PaystackProvider(testSecret(), fetcher);
  await expect(
    provider.listBanks({ limit: 50, cursor: 'abc' }),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  await expect(provider.listBanks({ limit: 50 })).rejects.toThrow();
});
