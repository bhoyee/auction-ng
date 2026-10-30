import { expect, it } from 'vitest';
import { safeBuyerReturnPath } from '../apps/web/lib/return-path';
it('returns buyers to local requested pages without open redirects or authentication loops', () => {
  expect(safeBuyerReturnPath('/wallet?payment=abc')).toBe(
    '/wallet?payment=abc',
  );
  expect(safeBuyerReturnPath('/invoices/123/pickup-pass')).toBe(
    '/invoices/123/pickup-pass',
  );
  for (const value of [
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/sign-in?next=/wallet',
    '/sign-up',
    '/forgot-password',
    '/\n/evil.example',
    'javascript:alert(1)',
    null,
  ])
    expect(safeBuyerReturnPath(value)).toBe('/account');
});
