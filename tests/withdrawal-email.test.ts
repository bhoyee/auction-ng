import { expect, it } from 'vitest';
import { withdrawalEmail } from '../apps/api/src/withdrawals/withdrawal-email';
import { signInEmail } from '../apps/api/src/auth/email-provider';
const input = {
  reference: 'A7D93BC2',
  last4: '6789',
  status: 'success' as const,
  amountKobo: 100000,
  feeKobo: 1000,
  returnedKobo: 0,
  walletUrl: 'https://auctionng.com/wallet',
};
it('renders professional status emails without private bank details or invented instant arrival', () => {
  const mail = withdrawalEmail(input);
  expect(mail.Subject).toContain('withdrawal was sent');
  expect(mail.Text).toContain('may take longer');
  expect(mail.HTML).toContain('ending <strong>6789');
  expect(mail.HTML).not.toContain('0123456789');
  for (const status of ['failed', 'reversed', 'rejected'] as const) {
    const result = withdrawalEmail({
      ...input,
      status,
      returnedKobo: 101000,
      feeKobo: 0,
    });
    expect(result.Text).toContain('returned to your wallet');
  }
  expect(() =>
    withdrawalEmail({ ...input, walletUrl: 'javascript:alert(1)' }),
  ).toThrow();
});
it('labels withdrawal codes separately from sign-in and recovery codes', () => {
  const mail = signInEmail('123456', 'withdraw');
  expect(mail.Subject.toLowerCase()).toContain('withdrawal');
  expect(mail.Text).toMatch(/confirm your wallet withdrawal/i);
});
