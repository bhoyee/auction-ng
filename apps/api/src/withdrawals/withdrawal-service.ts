import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  calculateWithdrawal,
  DEFAULT_WITHDRAWAL_RULES,
  fromLedgerKobo,
  withdrawalBankInputSchema,
  withdrawalBankSchema,
  withdrawalConfirmSchema,
  withdrawalSchema,
  withdrawalStartSchema,
} from '@auction-ng/shared';
import type {
  Withdrawal,
  WithdrawalBank,
  Prisma,
} from '../generated/prisma/client';
import { LedgerService } from '../ledger/ledger-service';
import { AuthService } from '../auth/auth-service';
import { verifyStaffPassword } from '../auth/staff-crypto';
import { decryptPii, encryptPii, hashPii } from '../security/pii';
import type { PaymentProvider } from '../payments/payment-provider';
import { paymentReturnUrl } from '../payments/payment-return-url';

const detailsSchema = z
  .object({
    bankCode: z.string(),
    accountNumber: z.string().regex(/^\d{10}$/),
    accountName: z.string(),
    bankName: z.string(),
    firstName: z.string(),
    lastName: z.string(),
  })
  .strict();
const details = (bank: WithdrawalBank) =>
  detailsSchema.parse(
    JSON.parse(
      decryptPii(Buffer.from(bank.detailsCiphertext), 'withdrawal-bank'),
    ),
  );
const safe = (row: Withdrawal) =>
  withdrawalSchema.parse({
    id: row.id,
    status: row.status,
    amountKobo: fromLedgerKobo(row.amountKobo),
    feeKobo: fromLedgerKobo(row.feeKobo),
    levyKobo: fromLedgerKobo(row.levyKobo),
    totalKobo: fromLedgerKobo(row.totalKobo),
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    reviewRequired: row.reviewRequired,
    settledFeeKobo:
      row.settledFeeKobo === null ? null : fromLedgerKobo(row.settledFeeKobo),
    returnedKobo:
      row.returnedKobo === null ? null : fromLedgerKobo(row.returnedKobo),
  });
const masked = (bank: WithdrawalBank) => {
  const data = details(bank);
  return withdrawalBankSchema.parse({
    id: bank.id,
    status: bank.status,
    bankName: data.bankName,
    accountName: data.accountName,
    accountLast4: data.accountNumber.slice(-4),
  });
};
const nameWords = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean);
function matchesMask(value: string, mask: string) {
  return (
    mask.length === value.length &&
    (mask.match(/\d/g)?.length ?? 0) >= 4 &&
    /^[\d*]+$/.test(mask) &&
    [...mask].every((char, index) => char === '*' || char === value[index])
  );
}
export class WithdrawalService {
  private async notify(
    tx: Prisma.TransactionClient,
    row: Withdrawal,
    status: 'success' | 'failed' | 'reversed' | 'rejected',
    feeKobo: bigint,
  ) {
    const user = await tx.user.findUniqueOrThrow({
        where: { id: row.userId },
        select: { emailCiphertext: true },
      }),
      bank = await tx.withdrawalBank.findUniqueOrThrow({
        where: { id: row.bankId },
      });
    await tx.notification.createMany({
      skipDuplicates: true,
      data: [
        {
          userId: row.userId,
          reference: `withdrawal:${row.id}:${status}`,
          channel: 'email',
          template: 'withdrawal-v1',
          payloadCiphertext: encryptPii(
            JSON.stringify({
              emailCiphertext: user.emailCiphertext
                ? Buffer.from(user.emailCiphertext).toString('base64')
                : null,
              message: {
                reference: row.id.slice(0, 8).toUpperCase(),
                last4: details(bank).accountNumber.slice(-4),
                status,
                amountKobo: fromLedgerKobo(row.amountKobo),
                feeKobo: fromLedgerKobo(feeKobo),
                returnedKobo:
                  status === 'success'
                    ? 0
                    : fromLedgerKobo(row.totalKobo - feeKobo),
                walletUrl: new URL(
                  '/wallet',
                  paymentReturnUrl('wallet', row.id),
                ).href,
              },
            }),
            'notification',
          ),
        },
      ],
    });
  }
  readonly enabled: boolean;
  readonly rules: typeof DEFAULT_WITHDRAWAL_RULES;
  constructor(
    private readonly ledger: LedgerService,
    private readonly auth: AuthService,
    private readonly provider?: PaymentProvider,
    options: { enabled?: boolean } = {},
  ) {
    this.enabled =
      options.enabled ?? process.env.WITHDRAWALS_ENABLED === 'true';
    const number = (key: string, fallback: number) =>
      z.coerce
        .number()
        .int()
        .positive()
        .safe()
        .parse(process.env[key] ?? fallback);
    this.rules = {
      ...DEFAULT_WITHDRAWAL_RULES,
      minimumKobo: number(
        'WITHDRAWAL_MINIMUM_KOBO',
        DEFAULT_WITHDRAWAL_RULES.minimumKobo,
      ),
      dailyLimitKobo: number(
        'WITHDRAWAL_DAILY_LIMIT_KOBO',
        DEFAULT_WITHDRAWAL_RULES.dailyLimitKobo,
      ),
    };
  }
  private available() {
    if (!this.enabled || !this.provider)
      throw new ServiceUnavailableException(
        'Withdrawals are not enabled. Contact support.',
      );
    return this.provider;
  }
  private async buyer(
    userId: string,
    tx: Prisma.TransactionClient = this.ledger.db,
  ) {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (
      !user ||
      user.role !== 'buyer' ||
      user.status !== 'active' ||
      !user.emailVerifiedAt ||
      !user.emailCiphertext
    )
      throw new ForbiddenException(
        'A verified, active buyer account is required.',
      );
    return user;
  }
  async overview(userId: string) {
    await this.buyer(userId);
    const wallet = await this.ledger.db.wallet.findUnique({
      where: { userId },
    });
    const bank = await this.ledger.db.withdrawalBank.findUnique({
      where: { userId },
    });
    let automatic = 0n,
      review = 0n;
    if (wallet) {
      await this.ledger.db.$transaction(async (tx) => {
        const balance = await this.ledger.lockedBalances(tx, wallet.id);
        automatic = (await this.ledger.bankFunds(wallet.id, tx)).availableKobo;
        review = balance.availableKobo - automatic;
      });
    }
    return {
      enabled:
        this.enabled &&
        Boolean(this.provider?.sendPayout && this.provider.verifyPayout),
      automaticAvailableKobo: fromLedgerKobo(automatic),
      reviewAvailableKobo: fromLedgerKobo(review),
      minimumKobo: this.rules.minimumKobo,
      dailyLimitKobo: this.rules.dailyLimitKobo,
      bank: bank ? masked(bank) : null,
    };
  }
  quote(amount: number) {
    this.available();
    try {
      return calculateWithdrawal(amount, this.rules);
    } catch {
      throw new BadRequestException('Check the withdrawal amount and minimum.');
    }
  }
  async verifyBank(
    userId: string,
    input: z.input<typeof withdrawalBankInputSchema>,
  ) {
    const provider = this.available();
    const value = withdrawalBankInputSchema.parse(input);
    const user = await this.buyer(userId);
    if (user.bvnHash && user.bvnHash !== hashPii(value.bvn, 'bvn'))
      throw new ConflictException(
        'Contact support to correct your verified identity details.',
      );
    if (
      !provider.resolvePayoutAccount ||
      !provider.payoutCustomer ||
      !provider.validatePayoutCustomer
    )
      throw new ServiceUnavailableException(
        'Bank verification is unavailable.',
      );
    const existing = await this.ledger.db.withdrawalBank.findUnique({
      where: { userId },
    });
    const accountHash = hashPii(
      `${value.bankCode}:${value.accountNumber}`,
      'withdrawal-account',
    );
    if (existing) {
      if (existing.accountHash !== accountHash)
        throw new ConflictException(
          'Contact support to change your withdrawal bank account.',
        );
      return this.retryBank(userId);
    }
    const resolved = await provider.resolvePayoutAccount(
      value.bankCode,
      value.accountNumber,
    );
    const words = nameWords(resolved.accountName);
    if (
      ![...nameWords(value.firstName), ...nameWords(value.lastName)].every(
        (word) => words.includes(word),
      )
    )
      throw new BadRequestException(
        'Use the names registered to your bank account and BVN.',
      );
    const bank = await this.ledger.db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          bvnHash: hashPii(value.bvn, 'bvn'),
          bvnCiphertext: encryptPii(value.bvn, 'bvn'),
        },
      });
      return tx.withdrawalBank.create({
        data: {
          userId,
          accountHash,
          detailsCiphertext: encryptPii(
            JSON.stringify({
              bankCode: value.bankCode,
              accountNumber: value.accountNumber,
              accountName: resolved.accountName,
              bankName: resolved.bankName,
              firstName: value.firstName,
              lastName: value.lastName,
            }),
            'withdrawal-bank',
          ),
        },
      });
    });
    return this.retryBank(bank.userId);
  }
  async retryBank(userId: string) {
    const provider = this.available(),
      user = await this.buyer(userId);
    let bank = await this.ledger.db.withdrawalBank.findUniqueOrThrow({
      where: { userId },
    });
    if (bank.status !== 'pending') return masked(bank);
    if (
      !provider.payoutCustomer ||
      !provider.validatePayoutCustomer ||
      !user.bvnCiphertext
    )
      throw new ServiceUnavailableException(
        'Identity verification is unavailable.',
      );
    const account = details(bank);
    if (!bank.customerCode) {
      const customerCode = await provider.payoutCustomer(
        decryptPii(Buffer.from(user.emailCiphertext ?? []), 'email'),
        account.firstName,
        account.lastName,
      );
      bank = await this.ledger.db.withdrawalBank.update({
        where: { id: bank.id },
        data: { customerCode },
      });
    }
    if (!bank.customerCode) throw new ConflictException();
    await provider.validatePayoutCustomer(bank.customerCode, {
      ...account,
      bvn: decryptPii(Buffer.from(user.bvnCiphertext), 'bvn'),
    });
    return masked(bank);
  }
  async providerEvent(event: string, data: unknown) {
    if (
      ['transfer.success', 'transfer.failed', 'transfer.reversed'].includes(
        event,
      )
    ) {
      const parsed = z
        .object({ reference: z.string().max(160) })
        .safeParse(data);
      if (!parsed.success) throw new BadRequestException();
      const row = await this.ledger.db.withdrawal.findUnique({
        where: { reference: parsed.data.reference },
      });
      if (row) await this.process(row.id);
      return;
    }
    if (
      ![
        'customeridentification.success',
        'customeridentification.failed',
      ].includes(event)
    )
      return;
    const value = z
      .object({
        customer_code: z.string(),
        identification: z.object({
          country: z.literal('NG'),
          type: z.literal('bank_account'),
          bank_code: z.string(),
          account_number: z.string(),
          bvn: z.string(),
        }),
      })
      .parse(data);
    const bank = await this.ledger.db.withdrawalBank.findUnique({
      where: { customerCode: value.customer_code },
    });
    if (!bank || bank.status !== 'pending') return;
    const user = await this.buyer(bank.userId);
    const account = details(bank);
    const bvn = user.bvnCiphertext
      ? decryptPii(Buffer.from(user.bvnCiphertext), 'bvn')
      : '';
    if (
      value.identification.bank_code !== account.bankCode ||
      !matchesMask(
        account.accountNumber,
        value.identification.account_number,
      ) ||
      !matchesMask(bvn, value.identification.bvn)
    )
      throw new BadRequestException(
        'Bank verification does not match the requested account.',
      );
    if (event.endsWith('.failed')) {
      await this.ledger.db.withdrawalBank.updateMany({
        where: { id: bank.id, status: 'pending' },
        data: { status: 'rejected' },
      });
      return;
    }
    const provider = this.available();
    const email = decryptPii(Buffer.from(user.emailCiphertext ?? []), 'email');
    if (
      !provider.verifyPayoutCustomer ||
      !(await provider.verifyPayoutCustomer(value.customer_code, email))
    )
      throw new ConflictException('Identity verification is not confirmed.');
    await this.ledger.db.withdrawalBank.updateMany({
      where: { id: bank.id, status: 'pending' },
      data: { status: 'verified', verifiedAt: new Date() },
    });
  }
  async start(
    userId: string,
    sessionId: string,
    input: z.input<typeof withdrawalStartSchema>,
  ) {
    this.available();
    const value = withdrawalStartSchema.parse(input);
    const user = await this.buyer(userId);
    if (
      !user.buyerPasswordHash ||
      !(await verifyStaffPassword(value.password, user.buyerPasswordHash))
    )
      throw new UnauthorizedException('Check your password.');
    const quote = this.quote(value.amountKobo);
    if (quote.totalKobo !== value.acceptedTotalKobo)
      throw new ConflictException(
        'Withdrawal fees changed. Review the total again.',
      );
    const bank = await this.ledger.db.withdrawalBank.findFirst({
      where: { id: value.bankId, userId, status: 'verified' },
    });
    if (!bank)
      throw new ConflictException(
        'Verify your own bank account before withdrawing.',
      );
    const wallet = await this.ledger.db.wallet.findUniqueOrThrow({
      where: { userId },
    });
    const requestHash = hashPii(
      JSON.stringify([
        value.bankId,
        value.amountKobo,
        value.acceptedTotalKobo,
        sessionId,
      ]),
      'withdrawal-request',
    );
    const row = await this.ledger.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId + value.idempotencyKey},529))`;
      const prior = await tx.withdrawal.findUnique({
        where: {
          userId_requestKey: { userId, requestKey: value.idempotencyKey },
        },
      });
      if (prior) {
        if (prior.requestHash !== requestHash)
          throw new ConflictException(
            'Use a new request key for a changed withdrawal.',
          );
        return prior;
      }
      const id = randomUUID(),
        code = randomInt(0, 1000000).toString().padStart(6, '0');
      return tx.withdrawal.create({
        data: {
          id,
          userId,
          walletId: wallet.id,
          bankId: bank.id,
          sessionId,
          requestKey: value.idempotencyKey,
          requestHash,
          reference: 'wd_' + id.replaceAll('-', ''),
          amountKobo: BigInt(quote.amountKobo),
          feeKobo: BigInt(quote.feeKobo),
          levyKobo: BigInt(quote.levyKobo),
          totalKobo: BigInt(quote.totalKobo),
          passwordSnapshot: hashPii(
            user.buyerPasswordHash ?? '',
            'withdrawal-password',
          ),
          codeHash: hashPii(id + ':' + code, 'withdrawal-code'),
          codeCiphertext: encryptPii(code, 'withdrawal-code'),
          expiresAt: new Date(Date.now() + 300000),
        },
      });
    });
    if (
      row.status === 'draft' &&
      !row.emailedAt &&
      row.expiresAt > new Date()
    ) {
      await this.auth.sendWithdrawalCode(
        decryptPii(Buffer.from(user.emailCiphertext ?? []), 'email'),
        decryptPii(Buffer.from(row.codeCiphertext), 'withdrawal-code'),
      );
      await this.ledger.db.withdrawal.updateMany({
        where: { id: row.id, emailedAt: null },
        data: { emailedAt: new Date() },
      });
    }
    return safe(row);
  }
  async confirm(
    userId: string,
    sessionId: string,
    input: z.input<typeof withdrawalConfirmSchema>,
  ) {
    this.available();
    const value = withdrawalConfirmSchema.parse(input);
    const outcome = await this.ledger.db.$transaction(async (tx) => {
      // Same user/session/wallet lock order as password and eligibility changes.
      await tx.$queryRaw`SELECT id FROM users WHERE id=${userId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${sessionId}::uuid FOR UPDATE`;
      const user = await this.buyer(userId, tx);
      const session = await tx.authSession.findFirst({
        where: {
          id: sessionId,
          userId,
          buyerMfa: true,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!session) throw new UnauthorizedException();
      await tx.$queryRaw`SELECT id FROM withdrawals WHERE id=${value.id}::uuid AND user_id=${userId}::uuid FOR UPDATE`;
      const row = await tx.withdrawal.findFirst({
        where: { id: value.id, userId },
      });
      if (!row) throw new NotFoundException();
      if (row.sessionId !== sessionId) throw new ForbiddenException();
      if (row.status !== 'draft') return { row };
      if (
        row.expiresAt <= new Date() ||
        row.attempts >= 5 ||
        row.passwordSnapshot !==
          hashPii(user.buyerPasswordHash ?? '', 'withdrawal-password')
      )
        return { error: 'This withdrawal code expired. Start again.' };
      const actual = Buffer.from(
        hashPii(row.id + ':' + value.code, 'withdrawal-code'),
      );
      if (!timingSafeEqual(actual, Buffer.from(row.codeHash))) {
        await tx.withdrawal.update({
          where: { id: row.id },
          data: { attempts: { increment: 1 } },
        });
        return { error: 'Check the six-digit withdrawal code.' };
      }
      const bank = await tx.withdrawalBank.findFirst({
        where: { id: row.bankId, userId, status: 'verified' },
      });
      if (!bank) throw new ConflictException('Bank verification is required.');
      const balance = await this.ledger.lockedBalances(tx, row.walletId);
      if (balance.availableKobo < row.totalKobo)
        throw new ConflictException(
          'Available wallet funds are too low for this withdrawal and fees.',
        );
      const day = new Date(
        Math.floor((Date.now() + 3600000) / 86400000) * 86400000 - 3600000,
      );
      const used = await tx.withdrawal.aggregate({
        where: {
          userId,
          confirmedAt: { gte: day },
          status: {
            in: ['review', 'queued', 'processing', 'pending', 'success'],
          },
        },
        _sum: { amountKobo: true },
      });
      if (
        (used._sum.amountKobo ?? 0n) + row.amountKobo >
        BigInt(this.rules.dailyLimitKobo)
      )
        throw new ConflictException(
          'Your daily withdrawal limit would be exceeded. Try a smaller amount or tomorrow.',
        );
      const bankFunds = await this.ledger.bankFunds(row.walletId, tx);
      const reviewRequired = bankFunds.availableKobo < row.totalKobo;
      const holdId = randomUUID();
      await this.ledger.holdInTransaction(tx, {
        walletId: row.walletId,
        holdId,
        amountKobo: row.totalKobo,
        idempotencyKey: `withdraw:hold:${row.id}`,
        reference: `withdraw:hold:${row.id}`,
      });
      return {
        row: await tx.withdrawal.update({
          where: { id: row.id },
          data: {
            holdId,
            reviewRequired,
            confirmedAt: new Date(),
            status: reviewRequired ? 'review' : 'queued',
          },
        }),
      };
    });
    if ('error' in outcome) throw new BadRequestException(outcome.error);
    return safe(outcome.row);
  }
  async get(userId: string, id: string) {
    const row = await this.ledger.db.withdrawal.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException();
    return safe(row);
  }
  async history(userId: string, limit: number, cursor?: string) {
    let anchor: { at: string; id: string; owner: string } | undefined;
    if (cursor) {
      try {
        anchor = z
          .object({
            at: z.iso.datetime(),
            id: z.uuid(),
            owner: z.literal(userId),
          })
          .strict()
          .parse(JSON.parse(Buffer.from(cursor, 'base64url').toString()));
      } catch {
        throw new BadRequestException(
          'Use the next cursor for your withdrawal list.',
        );
      }
    }
    const rows = await this.ledger.db.withdrawal.findMany({
      where: {
        userId,
        ...(anchor
          ? {
              OR: [
                { createdAt: { lt: new Date(anchor.at) } },
                { createdAt: new Date(anchor.at), id: { lt: anchor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const items = rows.slice(0, limit),
      last = items.at(-1);
    return {
      items: items.map(safe),
      nextCursor:
        rows.length > limit && last
          ? Buffer.from(
              JSON.stringify({
                at: last.createdAt.toISOString(),
                id: last.id,
                owner: userId,
              }),
            ).toString('base64url')
          : null,
    };
  }
  async process(id: string) {
    const provider = this.available();
    let row = await this.ledger.db.withdrawal.findUniqueOrThrow({
      where: { id },
    });
    if (!['queued', 'processing', 'pending', 'success'].includes(row.status))
      return;
    let bank = await this.ledger.db.withdrawalBank.findUniqueOrThrow({
      where: { id: row.bankId },
    });
    if (row.status === 'queued') {
      await this.buyer(row.userId);
      if (bank.status !== 'verified')
        throw new ConflictException(
          'Bank verification is required before payment.',
        );
      if (!bank.recipientCode) {
        if (!provider.payoutRecipient) throw new ServiceUnavailableException();
        const account = details(bank);
        const recipientCode = await provider.payoutRecipient(account);
        bank = await this.ledger.db.withdrawalBank.update({
          where: { id: bank.id },
          data: { recipientCode },
        });
      }
      const claimed = await this.ledger.db.withdrawal.updateMany({
        where: { id, status: 'queued', attemptedAt: null },
        data: { status: 'processing', attemptedAt: new Date() },
      });
      if (claimed.count) {
        try {
          if (!provider.sendPayout || !bank.recipientCode)
            throw new ServiceUnavailableException();
          await provider.sendPayout({
            reference: row.reference,
            recipientCode: bank.recipientCode,
            amountKobo: fromLedgerKobo(row.amountKobo),
          });
        } catch {
          /* An ambiguous request must be verified, never blindly sent twice. */
        }
      }
    }
    if (!provider.verifyPayout) return;
    let remote = await provider.verifyPayout(row.reference);
    // Paystack documents retries with the original reference as the duplicate-
    // credit protection. Reconcile first; never replace that reference.
    if (
      !remote &&
      row.attemptedAt &&
      row.attemptedAt.getTime() < Date.now() - 30000 &&
      bank.recipientCode &&
      provider.sendPayout
    ) {
      const claimed = await this.ledger.db.withdrawal.updateMany({
        where: {
          id,
          status: { in: ['processing', 'pending'] },
          OR: [
            { checkedAt: null },
            { checkedAt: { lt: new Date(Date.now() - 1000) } },
          ],
        },
        data: { checkedAt: new Date() },
      });
      if (claimed.count) {
        try {
          await provider.sendPayout({
            reference: row.reference,
            recipientCode: bank.recipientCode,
            amountKobo: fromLedgerKobo(row.amountKobo),
          });
        } catch {
          /* The original reference remains the only transfer identity. */
        }
        remote = await provider.verifyPayout(row.reference);
      }
    }
    if (!remote) {
      await this.ledger.db.withdrawal.updateMany({
        where: { id, status: { in: ['processing', 'pending'] } },
        data: { status: 'pending', checkedAt: new Date() },
      });
      return;
    }
    if (
      remote.reference !== row.reference ||
      remote.amountKobo !== fromLedgerKobo(row.amountKobo) ||
      remote.recipientCode !== bank.recipientCode ||
      remote.currency !== 'NGN' ||
      remote.domain !== 'test' ||
      !Number.isSafeInteger(remote.feeKobo) ||
      remote.feeKobo < 0 ||
      BigInt(remote.feeKobo) > row.feeKobo + row.levyKobo
    )
      throw new ConflictException('The transfer result needs reconciliation.');
    await this.ledger.db.$transaction(async (tx) => {
      await this.ledger.lockedBalances(tx, row.walletId);
      await tx.$queryRaw`SELECT id FROM withdrawals WHERE id=${id}::uuid FOR UPDATE`;
      row = await tx.withdrawal.findUniqueOrThrow({ where: { id } });
      if (['failed', 'reversed', 'rejected'].includes(row.status)) return;
      if (!row.holdId) throw new ConflictException();
      const success = remote.status === 'success',
        failed = ['failed', 'reversed'].includes(remote.status);
      // Paystack's public transfer response does not specify whether
      // fee_charged includes a retained stamp duty. Never guess a tax refund.
      if (failed && row.levyKobo > 0n)
        throw new ConflictException(
          'Transfer levy retention requires provider reconciliation.',
        );
      if (row.status === 'success' && remote.status === 'failed')
        throw new ConflictException(
          'A completed transfer requires a verified reversal.',
        );
      if (!success && !failed) {
        await tx.withdrawal.update({
          where: { id },
          data: {
            ...(row.status === 'success' ? {} : { status: 'pending' }),
            checkedAt: new Date(),
          },
        });
        return;
      }
      if (success && row.status === 'success') {
        await tx.withdrawal.update({
          where: { id },
          data: { checkedAt: new Date() },
        });
        return;
      }
      const base = {
        walletId: row.walletId,
        holdId: row.holdId,
        idempotencyKey: `withdraw:release:${id}`,
        reference: `withdraw:release:${id}`,
      };
      if (row.status !== 'success')
        await this.ledger.releaseInTransaction(tx, base);
      if (success) {
        const payout = await this.ledger.payoutInTransaction(tx, {
          walletId: row.walletId,
          amountKobo: row.totalKobo,
          idempotencyKey: `withdraw:pay:${id}`,
          reference: `withdraw:pay:${id}`,
        });
        await tx.withdrawal.update({
          where: { id },
          data: {
            status: 'success',
            settledFeeKobo: row.feeKobo + row.levyKobo,
            returnedKobo: 0n,
            payoutId: payout.id,
            checkedAt: new Date(),
          },
        });
        await this.notify(tx, row, 'success', row.feeKobo + row.levyKobo);
      } else {
        const retained = BigInt(remote.feeKobo);
        if (row.status === 'success' && row.payoutId) {
          await this.ledger.reversePayoutInTransaction(tx, {
            walletId: row.walletId,
            amountKobo: row.totalKobo - retained,
            sourceTransactionId: row.payoutId,
            idempotencyKey: `withdraw:reverse:${id}`,
            reference: `withdraw:reverse:${id}`,
          });
        } else if (retained > 0n) {
          await this.ledger.payoutInTransaction(tx, {
            walletId: row.walletId,
            amountKobo: retained,
            idempotencyKey: `withdraw:fee:${id}`,
            reference: `withdraw:fee:${id}`,
          });
        }
        await tx.withdrawal.update({
          where: { id },
          data: {
            status: remote.status,
            checkedAt: new Date(),
            settledFeeKobo: retained,
            returnedKobo: row.totalKobo - retained,
          },
        });
        await this.notify(
          tx,
          row,
          remote.status === 'reversed' ? 'reversed' : 'failed',
          retained,
        );
      }
    });
  }
  async maintain() {
    if (!this.enabled) return { checked: 0, failed: 0 };
    const pending = await this.ledger.db.withdrawal.findMany({
      where: { status: { in: ['queued', 'processing', 'pending'] } },
      orderBy: [{ checkedAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
      take: 3,
      select: { id: true },
    });
    const completed = await this.ledger.db.withdrawal.findMany({
      where: { status: 'success' },
      orderBy: [{ checkedAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
      take: 1,
      select: { id: true },
    });
    const rows = [...pending, ...completed];
    let failed = 0;
    for (const row of rows) {
      try {
        await this.process(row.id);
      } catch {
        failed++;
        await this.ledger.db.withdrawal.update({
          where: { id: row.id },
          data: { checkedAt: new Date() },
        });
      }
    }
    return { checked: rows.length, failed };
  }
  async review(actorId: string, id: string, approve: boolean, reason: string) {
    return this.ledger.db.$transaction(async (tx) => {
      const actor = await tx.user.findFirst({
        where: {
          id: actorId,
          status: 'active',
          role: { in: ['finance', 'admin'] },
        },
      });
      if (!actor) throw new ForbiddenException();
      const initial = await tx.withdrawal.findUniqueOrThrow({ where: { id } });
      await this.ledger.lockedBalances(tx, initial.walletId);
      await tx.$queryRaw`SELECT id FROM withdrawals WHERE id=${id}::uuid FOR UPDATE`;
      const row = await tx.withdrawal.findUniqueOrThrow({ where: { id } });
      if (
        row.reviewRequired &&
        approve &&
        [
          'queued',
          'processing',
          'pending',
          'success',
          'failed',
          'reversed',
        ].includes(row.status)
      )
        return safe(row);
      if (!approve && row.status === 'rejected') return safe(row);
      if (row.status !== 'review')
        throw new ConflictException('This withdrawal is not awaiting review.');
      if (!approve) {
        if (!row.holdId) throw new ConflictException();
        await this.ledger.releaseInTransaction(tx, {
          walletId: row.walletId,
          holdId: row.holdId,
          idempotencyKey: `withdraw:reject:${id}`,
          reference: `withdraw:reject:${id}`,
        });
        await this.notify(tx, row, 'rejected', 0n);
      }
      await tx.auditLog.create({
        data: {
          actorId,
          action: approve ? 'withdrawal.approved' : 'withdrawal.rejected',
          entityType: 'withdrawal',
          entityId: id,
          afterCiphertext: encryptPii(JSON.stringify({ reason }), 'audit'),
          beforeCiphertext: encryptPii(
            JSON.stringify({
              status: row.status,
              totalKobo: String(row.totalKobo),
            }),
            'audit',
          ),
        },
      });
      return safe(
        await tx.withdrawal.update({
          where: { id },
          data: {
            status: approve ? 'queued' : 'rejected',
            ...(!approve
              ? { settledFeeKobo: 0n, returnedKobo: row.totalKobo }
              : {}),
          },
        }),
      );
    });
  }
}
