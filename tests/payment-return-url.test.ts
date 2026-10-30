import { afterEach, expect, it, vi } from 'vitest';
import { paymentReturnUrl } from '../apps/api/src/payments/payment-return-url';
const id = 'befb5e30-e497-47ec-ad8d-7258be80eadb';
afterEach(() => vi.unstubAllEnvs());
it('builds server-owned checkout returns for wallet and fixed purchases', () => {
  vi.stubEnv('PAYMENT_RETURN_ORIGIN', 'https://buyers.example.test');
  expect(paymentReturnUrl('wallet', id)).toBe(
    `https://buyers.example.test/payments/return?kind=wallet&id=${id}`,
  );
  expect(paymentReturnUrl('purchase', id)).toBe(
    `https://buyers.example.test/payments/return?kind=purchase&id=${id}`,
  );
});
it('allows local browser return addresses without exposing the API tunnel', () => {
  vi.stubEnv('PAYMENT_RETURN_ORIGIN', 'http://localhost:3300');
  expect(paymentReturnUrl('wallet', id)).toContain(
    'http://localhost:3300/payments/return?',
  );
});
it('rejects insecure public or credential-bearing return origins and invalid IDs', () => {
  for (const origin of [
    'http://example.test',
    'https://user:pass@example.test',
    'https://example.test/redirect',
    'https://example.test/?next=evil',
    'https://example.test/#evil',
    'javascript:alert(1)',
  ]) {
    vi.stubEnv('PAYMENT_RETURN_ORIGIN', origin);
    expect(() => paymentReturnUrl('wallet', id)).toThrow();
  }
  vi.stubEnv('PAYMENT_RETURN_ORIGIN', 'https://buyers.example.test');
  expect(() => paymentReturnUrl('wallet', '../wallet')).toThrow();
});
