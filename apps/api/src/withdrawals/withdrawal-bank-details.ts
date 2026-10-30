import { z } from 'zod';
import { withdrawalBankSchema } from '@auction-ng/shared';
import type { WithdrawalBank } from '../generated/prisma/client';
import { decryptPii } from '../security/pii';
export const bankDetailsSchema = z
  .object({
    bankCode: z.string(),
    accountNumber: z.string().regex(/^\d{10}$/),
    accountName: z.string(),
    bankName: z.string(),
    firstName: z.string(),
    lastName: z.string(),
  })
  .strict();
export const details = (bank: Pick<WithdrawalBank, 'detailsCiphertext'>) =>
  bankDetailsSchema.parse(
    JSON.parse(
      decryptPii(Buffer.from(bank.detailsCiphertext), 'withdrawal-bank'),
    ),
  );
export const masked = (bank: WithdrawalBank) => {
  const data = details(bank);
  return withdrawalBankSchema.parse({
    id: bank.id,
    status: bank.status,
    bankName: data.bankName,
    accountName: data.accountName,
    accountLast4: data.accountNumber.slice(-4),
  });
};
export const nameWords = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean);
export function matchesMask(value: string, mask: string) {
  return (
    mask.length === value.length &&
    (mask.match(/\d/g)?.length ?? 0) >= 4 &&
    /^[\d*]+$/.test(mask) &&
    [...mask].every((char, index) => char === '*' || char === value[index])
  );
}
