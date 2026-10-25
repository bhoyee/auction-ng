import { expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { PaystackProvider } from '../src/payments/paystack-provider';

const key = 'sk_test_fixtureonlynotarealkey';
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ status: true, data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
it('rejects live or malformed keys and verifies the exact raw webhook bytes', () => {
  for (const value of ['', 'sk_live_notallowed', 'pk_test_notallowed'])
    expect(() => new PaystackProvider(value)).toThrow();
  const p = new PaystackProvider(key);
  const raw = Buffer.from('{"event":"charge.success"}');
  const signature = createHmac('sha512', key).update(raw).digest('hex');
  expect(p.verifySignature(raw, signature)).toBe(true);
  expect(p.verifySignature(Buffer.from(raw.toString() + ' '), signature)).toBe(
    false,
  );
  expect(p.verifySignature(raw, 'x')).toBe(false);
});
it('uses fixed HTTPS Paystack endpoints with test credentials and extracts verified transfer data', async () => {
  const fetcher = vi.fn<typeof fetch>(async () =>
    response({
      reference: 'ref-12345678',
      amount: 1000000,
      fees: 10000,
      currency: 'NGN',
      domain: 'test',
      status: 'success',
      customer: { customer_code: 'CUS_1234' },
      authorization: { channel: 'dedicated_nuban' },
    }),
  );
  const p = new PaystackProvider(key, fetcher);
  expect(await p.verifyTransfer('ref-12345678')).toMatchObject({
    reference: 'ref-12345678',
    feeKobo: 10000,
    customerCode: 'CUS_1234',
  });
  const call = fetcher.mock.calls[0];
  expect(String(call?.[0])).toBe(
    'https://api.paystack.co/transaction/verify/ref-12345678',
  );
  expect(call?.[1]?.redirect).toBe('error');
});
it('fails safely on provider HTTP errors and invalid money without exposing response data', async () => {
  const p = new PaystackProvider(key, async () =>
    response({ secret: 'must-not-leak' }, 500),
  );
  await expect(p.verifyTransfer('ref-12345678')).rejects.toThrow(
    'Bank transfer service is unavailable',
  );
  const invalid = new PaystackProvider(key, async () =>
    response({
      reference: 'ref',
      amount: 1.5,
      fees: 0,
      currency: 'NGN',
      domain: 'test',
      status: 'success',
      customer: { customer_code: 'CUS_1234' },
      authorization: { channel: 'dedicated_nuban' },
    }),
  );
  await expect(invalid.verifyTransfer('ref-12345678')).rejects.toThrow();
});
it('requires identified test customers and active assigned NGN accounts', async () => {
  const customer = {
    email: 'ada@example.test',
    domain: 'test',
    customer_code: 'CUS_1234',
    identified: true,
    dedicated_account: {
      account_number: '9930000001',
      currency: 'NGN',
      active: true,
      assigned: true,
      bank: { name: 'Test Bank' },
    },
  };
  const p = new PaystackProvider(key, async () => response(customer));
  expect(await p.getAccount('ada@example.test')).toMatchObject({
    identified: true,
    accountNumber: '9930000001',
  });
  await expect(p.getAccount('other@example.test')).rejects.toThrow();
  expect(
    await new PaystackProvider(key, async () =>
      response({ ...customer, identified: false }),
    ).getAccount('ada@example.test'),
  ).toBeNull();
  expect(
    await new PaystackProvider(
      key,
      async () => new Response('', { status: 404 }),
    ).getAccount('ada@example.test'),
  ).toBeNull();
  await expect(
    new PaystackProvider(key, async () =>
      response({ ...customer, domain: 'live' }),
    ).getAccount('ada@example.test'),
  ).rejects.toThrow();
});
it('sends explicit identity details to test-bank only and handles asynchronous assignment', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => response(undefined));
  const p = new PaystackProvider(key, fetcher);
  await p.assignAccount({
    email: 'ada@example.test',
    firstName: 'Ada',
    lastName: 'Okafor',
    phone: '+2348030000000',
    bvn: '20012345678',
    bankCode: '007',
    accountNumber: '0123456789',
    consent: true,
    feePolicy: 'paystack-dva-v1',
  });
  const payload = JSON.parse(
    String(fetcher.mock.calls[0]?.[1]?.body),
  ) as Record<string, unknown>;
  expect(payload.preferred_bank).toBe('test-bank');
  expect(payload.bvn).toBe('20012345678');
});
it('paginates provider results in pages of 50 and excludes other channels', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      response(
        Array.from({ length: 50 }, (_, i) => ({
          reference: `ref-${i}`,
          domain: 'test',
          authorization: { channel: 'dedicated_nuban' },
        })),
      ),
    )
    .mockResolvedValueOnce(
      response([
        {
          reference: 'card-ref',
          domain: 'test',
          authorization: { channel: 'card' },
        },
      ]),
    );
  const p = new PaystackProvider(key, fetcher);
  expect(
    await p.listTransfers(new Date('2026-10-23'), new Date('2026-10-24')),
  ).toHaveLength(50);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('initializes card-only hosted checkout using the server-owned reference and NGN amount', async () => {
  const reference = 'auction-card-synthetic123';
  const fetcher = vi.fn<typeof fetch>(async () =>
    response({
      reference,
      authorization_url: 'https://checkout.paystack.com/synthetic123',
      access_code: 'synthetic-access-code',
    }),
  );
  const p = new PaystackProvider(key, fetcher);
  expect(
    await p.initializeCard({
      email: 'ada@example.test',
      reference,
      amountKobo: 1000000,
    }),
  ).toEqual({ authorizationUrl: 'https://checkout.paystack.com/synthetic123' });
  const payload = JSON.parse(
    String(fetcher.mock.calls[0]?.[1]?.body),
  ) as Record<string, unknown>;
  expect(payload).toEqual({
    email: 'ada@example.test',
    reference,
    amount: 1000000,
    currency: 'NGN',
    channels: ['card'],
  });
  expect(payload).not.toHaveProperty('card_number');
});
it('rejects foreign checkout hosts and changed initialization references', async () => {
  const reference = 'auction-card-synthetic123';
  for (const result of [
    { reference, authorization_url: 'https://example.test/checkout' },
    {
      reference: 'changed-reference',
      authorization_url: 'https://checkout.paystack.com/synthetic123',
    },
    {
      reference,
      authorization_url: 'http://checkout.paystack.com/synthetic123',
    },
  ]) {
    await expect(
      new PaystackProvider(key, async () => response(result)).initializeCard({
        email: 'ada@example.test',
        reference,
        amountKobo: 1000000,
      }),
    ).rejects.toThrow();
  }
});
it('extracts card ownership and issuer information and supports pending transactions without an authorization yet', async () => {
  const result = {
    reference: 'auction-card-synthetic123',
    amount: 1000000,
    fees: 25000,
    currency: 'NGN',
    domain: 'test',
    status: 'success',
    customer: { customer_code: 'CUS_synthetic', email: 'ada@example.test' },
    authorization: { channel: 'card', country_code: 'NG' },
  };
  expect(
    await new PaystackProvider(key, async () =>
      response(result),
    ).verifyTransfer(result.reference),
  ).toMatchObject({
    customerEmail: 'ada@example.test',
    cardCountry: 'NG',
    channel: 'card',
    feeKobo: 25000,
  });
  expect(
    await new PaystackProvider(key, async () =>
      response({
        ...result,
        status: 'pending',
        fees: null,
        authorization: null,
        channel: 'card',
      }),
    ).verifyTransfer(result.reference),
  ).toMatchObject({ status: 'pending', feeKobo: null, channel: 'card' });
});
it('includes only locally scoped card references alongside DVA transfers during reconciliation', async () => {
  const rows = [
    {
      reference: 'auction-card-synthetic123',
      domain: 'test',
      authorization: { channel: 'card' },
    },
    {
      reference: 'other-product-card',
      domain: 'test',
      authorization: { channel: 'card' },
    },
    {
      reference: 'bank-reference',
      domain: 'test',
      authorization: { channel: 'dedicated_nuban' },
    },
  ];
  expect(
    await new PaystackProvider(key, async () => response(rows)).listTransfers(
      new Date('2026-10-24'),
      new Date('2026-10-25'),
    ),
  ).toEqual(['auction-card-synthetic123', 'bank-reference']);
});
