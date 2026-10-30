import { expect, it } from 'vitest';
import { paymentBankCodeSchema } from '../packages/shared/src/payment-schemas';
import { withdrawalBankInputSchema } from '../packages/shared/src/withdrawal-schemas';

it('accepts the two-digit Nigerian directory code without changing leading zeros', () => {
  expect(paymentBankCodeSchema.parse('09')).toBe('09');
  expect(
    withdrawalBankInputSchema.parse({
      bankCode: '09',
      accountNumber: '0123456789',
      bvn: '22222222222',
      firstName: 'Amina',
      lastName: 'Yusuf',
      consent: true,
    }).bankCode,
  ).toBe('09');
});

it.each(['', '9', '09 ', '0/9', '<09>'])(
  'rejects malformed directory bank code %s',
  (code) => {
    expect(paymentBankCodeSchema.safeParse(code).success).toBe(false);
  },
);
