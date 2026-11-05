import { expect, it } from 'vitest';
import { refundEmail } from '../src/staff-admin/refund-email';
it('renders the wallet refund with Naira and escapes untrusted references', () => {
  const mail = refundEmail({
    reference: '<unsafe>',
    amountKobo: 1250000,
    walletUrl: 'https://example.test/wallet',
  });
  expect(mail.HTML).toContain('&lt;unsafe&gt;');
  expect(mail.HTML).not.toContain('<unsafe>');
  expect(mail.Text).toContain('₦12,500');
  expect(mail.Text).not.toContain('{{');
  expect(mail.HTML).not.toContain('{{');
  expect(mail.Subject).toContain('LotVanta');
});
it('rejects unsafe wallet links and non-integer amounts', () => {
  for (const walletUrl of [
    'javascript:alert(1)',
    'http://example.test',
    'https://user:pass@example.test',
  ])
    expect(() =>
      refundEmail({ reference: 'INV-TEST', amountKobo: 100, walletUrl }),
    ).toThrow();
  expect(() =>
    refundEmail({
      reference: 'INV-TEST',
      amountKobo: 1.5,
      walletUrl: 'https://example.test/wallet',
    }),
  ).toThrow();
});
