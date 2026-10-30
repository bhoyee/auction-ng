import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  bankChangeSchema,
  bankChangeStartSchema,
  withdrawalConfirmSchema,
} from '@auction-ng/shared';
import type { Prisma, WithdrawalBankChange } from '../generated/prisma/client';
import { LedgerService } from '../ledger/ledger-service';
import { AuthService } from '../auth/auth-service';
import { verifyStaffPassword } from '../auth/staff-crypto';
import { encryptPii, decryptPii, hashPii } from '../security/pii';
import type { PaymentProvider } from '../payments/payment-provider';
import {
  bankDetailsSchema,
  details,
  nameWords,
  matchesMask,
} from './withdrawal-bank-details';

const payload = (row: WithdrawalBankChange) =>
  bankDetailsSchema.parse(
    JSON.parse(
      decryptPii(Buffer.from(row.detailsCiphertext), 'bank-change-details'),
    ),
  );
const dto = (row: WithdrawalBankChange) => {
  const account = payload(row);
  return bankChangeSchema.parse({
    id: row.id,
    status:
      row.status === 'draft' && row.expiresAt <= new Date()
        ? 'expired'
        : row.status,
    expiresAt: row.expiresAt.toISOString(),
    emailSent: !!row.emailedAt,
    accountName: account.accountName,
    bankName: account.bankName,
    accountLast4: account.accountNumber.slice(-4),
  });
};
export class BankChangeService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly auth: AuthService,
    private readonly provider: () => PaymentProvider,
  ) {}
  private async identity(
    tx: Prisma.TransactionClient,
    userId: string,
    sessionId: string,
  ) {
    const user = await tx.user.findUnique({ where: { id: userId } });
    const session = await tx.authSession.findFirst({
      where: {
        id: sessionId,
        userId,
        buyerMfa: true,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (
      !user ||
      !session ||
      user.role !== 'buyer' ||
      user.status !== 'active' ||
      !user.emailVerifiedAt ||
      !user.emailCiphertext ||
      !user.buyerPasswordHash ||
      !user.bvnCiphertext ||
      !user.bvnHash
    )
      throw new UnauthorizedException(
        'Sign in again with your verified buyer account.',
      );
    return user;
  }
  private async lock(
    tx: Prisma.TransactionClient,
    userId: string,
    sessionId: string,
  ) {
    await tx.$queryRaw`SELECT id FROM users WHERE id=${userId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${sessionId}::uuid FOR UPDATE`;
    return this.identity(tx, userId, sessionId);
  }
  async noOutstanding(tx: Prisma.TransactionClient, userId: string) {
    if (
      await tx.withdrawal.findFirst({
        where: {
          userId,
          status: { in: ['review', 'queued', 'processing', 'pending'] },
        },
        select: { id: true },
      })
    )
      throw new ConflictException(
        'Wait until your outstanding withdrawal has finished before changing bank accounts.',
      );
  }
  async noVerification(tx: Prisma.TransactionClient, userId: string) {
    await this.clearInvalid(tx, userId);
    if (
      await tx.withdrawalBankChange.findFirst({
        where: { userId, status: 'verifying' },
        select: { id: true },
      })
    )
      throw new ConflictException(
        'Your bank account change is awaiting verification. Finish it before withdrawing.',
      );
  }
  private async clearInvalid(tx: Prisma.TransactionClient, userId: string) {
    const row = await tx.withdrawalBankChange.findFirst({
      where: { userId, status: 'verifying' },
    });
    if (!row) return;
    await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${row.sessionId}::uuid FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId } }),
      session = await tx.authSession.findUnique({
        where: { id: row.sessionId },
      });
    if (
      !user ||
      user.role !== 'buyer' ||
      user.status !== 'active' ||
      !user.emailVerifiedAt ||
      row.passwordSnapshot !==
        hashPii(user.buyerPasswordHash ?? '', 'bank-change-password') ||
      row.bvnHash !== user.bvnHash ||
      !session?.buyerMfa ||
      session.userId !== userId ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    )
      await tx.withdrawalBankChange.update({
        where: { id: row.id },
        data: { status: 'rejected' },
      });
  }
  async active(userId: string) {
    return this.ledger.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${userId}::uuid FOR UPDATE`;
      await this.clearInvalid(tx, userId);
      return tx.withdrawalBankChange.findFirst({
        where: {
          userId,
          status: { in: ['draft', 'verifying'] },
          OR: [
            { status: 'verifying' },
            { expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
          ],
        },
        select: { id: true, status: true },
      });
    });
  }
  async get(userId: string, id: string) {
    await this.active(userId);
    const row = await this.ledger.db.withdrawalBankChange.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException();
    return dto(row);
  }
  async start(
    userId: string,
    sessionId: string,
    input: z.input<typeof bankChangeStartSchema>,
  ) {
    const value = bankChangeStartSchema.parse(input),
      provider = this.provider();
    const initial = await this.ledger.db.user.findUnique({
      where: { id: userId },
    });
    if (
      !initial?.buyerPasswordHash ||
      !(await verifyStaffPassword(value.password, initial.buyerPasswordHash))
    )
      throw new UnauthorizedException('Check your password.');
    const requestHash = hashPii(
      JSON.stringify([
        sessionId,
        value.bankCode,
        value.accountNumber,
        value.consent,
      ]),
      'bank-change-request',
    );
    const prior = await this.ledger.db.withdrawalBankChange.findUnique({
      where: {
        userId_requestKey: { userId, requestKey: value.idempotencyKey },
      },
    });
    if (prior) {
      await this.ledger.db.$transaction(async (tx) => {
        const user = await this.lock(tx, userId, sessionId);
        if (
          prior.requestHash !== requestHash ||
          prior.passwordSnapshot !==
            hashPii(user.buyerPasswordHash ?? '', 'bank-change-password')
        )
          throw new ConflictException(
            'Start a new bank change for changed details.',
          );
      });
      return this.deliver(prior);
    }
    const source = await this.ledger.db.withdrawalBank.findFirst({
      where: { userId, isCurrent: true, status: 'verified' },
    });
    if (!source || !initial.bvnHash)
      throw new ConflictException('Verify your original bank and BVN first.');
    const original = details(source);
    if (
      value.bankCode === original.bankCode &&
      value.accountNumber === original.accountNumber
    )
      throw new BadRequestException(
        'This is already your selected bank account.',
      );
    if (!provider.resolvePayoutAccount)
      throw new ConflictException('Bank verification is unavailable.');
    const resolved = await provider.resolvePayoutAccount(
      value.bankCode,
      value.accountNumber,
    );
    if (
      ![
        ...nameWords(original.firstName),
        ...nameWords(original.lastName),
      ].every((word) => nameWords(resolved.accountName).includes(word))
    )
      throw new BadRequestException(
        'Use a bank account registered to your verified identity.',
      );
    const row = await this.ledger.db.$transaction(async (tx) => {
      const user = await this.lock(tx, userId, sessionId);
      if (
        user.buyerPasswordHash !== initial.buyerPasswordHash ||
        user.bvnHash !== initial.bvnHash
      )
        throw new ConflictException('Your credentials changed. Start again.');
      const repeated = await tx.withdrawalBankChange.findUnique({
        where: {
          userId_requestKey: { userId, requestKey: value.idempotencyKey },
        },
      });
      if (repeated) {
        if (repeated.requestHash !== requestHash) throw new ConflictException();
        return repeated;
      }
      await this.noOutstanding(tx, userId);
      const current = await tx.withdrawalBank.findFirst({
        where: { userId, isCurrent: true, status: 'verified' },
      });
      if (current?.id !== source.id)
        throw new ConflictException(
          'Your selected bank changed. Reload and try again.',
        );
      await tx.withdrawalBankChange.updateMany({
        where: {
          userId,
          status: 'draft',
          OR: [{ expiresAt: { lte: new Date() } }, { attempts: { gte: 5 } }],
        },
        data: { status: 'expired' },
      });
      if (
        await tx.withdrawalBankChange.findFirst({
          where: { userId, status: { in: ['draft', 'verifying'] } },
          select: { id: true },
        })
      )
        throw new ConflictException(
          'Finish your existing bank change or wait for its code to expire.',
        );
      const accountHash = hashPii(
        value.bankCode + ':' + value.accountNumber,
        'withdrawal-account',
      );
      const claimed = await tx.withdrawalBank.findUnique({
        where: { accountHash },
      });
      if (
        claimed &&
        (claimed.userId !== userId || claimed.status === 'rejected')
      )
        throw new ConflictException(
          'This account cannot be selected. Contact support.',
        );
      const id = randomUUID(),
        code = randomInt(0, 1000000).toString().padStart(6, '0');
      return tx.withdrawalBankChange.create({
        data: {
          id,
          userId,
          sessionId,
          sourceBankId: source.id,
          requestKey: value.idempotencyKey,
          requestHash,
          accountHash,
          passwordSnapshot: hashPii(
            user.buyerPasswordHash ?? '',
            'bank-change-password',
          ),
          bvnHash: user.bvnHash ?? '',
          detailsCiphertext: encryptPii(
            JSON.stringify({
              ...original,
              bankCode: value.bankCode,
              accountNumber: value.accountNumber,
              accountName: resolved.accountName,
              bankName: resolved.bankName,
            }),
            'bank-change-details',
          ),
          codeHash: hashPii(id + ':' + code, 'bank-change-code'),
          codeCiphertext: encryptPii(code, 'bank-change-code'),
          expiresAt: new Date(Date.now() + 300000),
        },
      });
    });
    return this.deliver(row);
  }
  private async deliver(row: WithdrawalBankChange) {
    if (
      row.status === 'draft' &&
      !row.emailedAt &&
      row.expiresAt > new Date() &&
      row.attempts < 5
    ) {
      const user = await this.ledger.db.user.findUniqueOrThrow({
        where: { id: row.userId },
      });
      await this.auth.sendBankChangeCode(
        decryptPii(Buffer.from(user.emailCiphertext ?? []), 'email'),
        decryptPii(Buffer.from(row.codeCiphertext), 'bank-change-code'),
      );
      await this.ledger.db.withdrawalBankChange.updateMany({
        where: { id: row.id, emailedAt: null },
        data: { emailedAt: new Date() },
      });
      return dto(
        await this.ledger.db.withdrawalBankChange.findUniqueOrThrow({
          where: { id: row.id },
        }),
      );
    }
    return dto(row);
  }
  async confirm(
    userId: string,
    sessionId: string,
    input: z.input<typeof withdrawalConfirmSchema>,
  ) {
    this.provider();
    const value = withdrawalConfirmSchema.parse(input);
    const result = await this.ledger.db.$transaction(async (tx) => {
      const user = await this.lock(tx, userId, sessionId);
      const row = await tx.withdrawalBankChange.findFirst({
        where: { id: value.id, userId },
      });
      if (!row) throw new NotFoundException();
      if (row.sessionId !== sessionId) throw new ForbiddenException();
      if (
        row.passwordSnapshot !==
          hashPii(user.buyerPasswordHash ?? '', 'bank-change-password') ||
        row.bvnHash !== user.bvnHash
      )
        throw new ConflictException('Your credentials changed. Start again.');
      if (row.status !== 'draft') return { row };
      if (row.expiresAt <= new Date() || row.attempts >= 5) {
        await tx.withdrawalBankChange.update({
          where: { id: row.id },
          data: { status: 'expired' },
        });
        return { error: 'This code expired. Start a new bank change.' };
      }
      if (
        !timingSafeEqual(
          Buffer.from(row.codeHash),
          Buffer.from(hashPii(row.id + ':' + value.code, 'bank-change-code')),
        )
      ) {
        await tx.withdrawalBankChange.update({
          where: { id: row.id },
          data: { attempts: { increment: 1 } },
        });
        return { error: 'Check the six-digit bank change code.' };
      }
      await this.noOutstanding(tx, userId);
      const source = await tx.withdrawalBank.findFirst({
        where: {
          id: row.sourceBankId,
          userId,
          isCurrent: true,
          status: 'verified',
        },
      });
      if (!source)
        throw new ConflictException('Your selected bank changed. Start again.');
      const account = payload(row);
      let target = await tx.withdrawalBank.findUnique({
        where: { accountHash: row.accountHash },
      });
      if (target && (target.userId !== userId || target.status === 'rejected'))
        throw new ConflictException('This account cannot be selected.');
      target ??= await tx.withdrawalBank.create({
        data: {
          userId,
          accountHash: row.accountHash,
          isCurrent: false,
          detailsCiphertext: encryptPii(
            JSON.stringify(account),
            'withdrawal-bank',
          ),
        },
      });
      return {
        row: await tx.withdrawalBankChange.update({
          where: { id: row.id },
          data: {
            status: 'verifying',
            targetBankId: target.id,
            confirmedAt: new Date(),
          },
        }),
      };
    });
    if ('error' in result) throw new BadRequestException(result.error);
    if (result.row.status === 'verifying') {
      // The code is consumed before contacting Paystack; ambiguous responses keep the same request.
      try {
        await this.retry(userId, sessionId, result.row.id);
      } catch {
        /* The owned retry action resumes this exact verification. */
      }
    }
    return this.get(userId, result.row.id);
  }
  async retry(userId: string, sessionId: string, id: string) {
    const provider = this.provider();
    const context = await this.ledger.db.$transaction(async (tx) => {
      const user = await this.lock(tx, userId, sessionId);
      const row = await tx.withdrawalBankChange.findFirst({
        where: { id, userId },
      });
      if (!row) throw new NotFoundException();
      if (
        row.sessionId !== sessionId ||
        row.passwordSnapshot !==
          hashPii(user.buyerPasswordHash ?? '', 'bank-change-password') ||
        row.bvnHash !== user.bvnHash
      )
        throw new ForbiddenException();
      return { row, user };
    });
    if (context.row.status === 'draft') return this.deliver(context.row);
    if (context.row.status !== 'verifying') return dto(context.row);
    if (!provider.payoutCustomer || !provider.validatePayoutCustomer)
      throw new ConflictException('Bank verification is unavailable.');
    const account = payload(context.row);
    const customerCode =
      context.row.customerCode ??
      (await provider.payoutCustomer(
        decryptPii(Buffer.from(context.user.emailCiphertext ?? []), 'email'),
        account.firstName,
        account.lastName,
      ));
    await this.ledger.db.withdrawalBankChange.updateMany({
      where: { id, status: 'verifying', customerCode: null },
      data: { customerCode },
    });
    const bound = await this.ledger.db.withdrawalBankChange.findUniqueOrThrow({
      where: { id },
    });
    if (bound.customerCode !== customerCode)
      throw new ConflictException(
        'Verification reference changed. Contact support.',
      );
    await provider.validatePayoutCustomer(customerCode, {
      ...account,
      bvn: decryptPii(Buffer.from(context.user.bvnCiphertext ?? []), 'bvn'),
    });
    return this.get(userId, id);
  }
  async providerEvent(
    event: string,
    value: {
      customer_code: string;
      identification: {
        bank_code: string;
        account_number: string;
        bvn: string;
      };
    },
  ) {
    const row = await this.ledger.db.withdrawalBankChange.findFirst({
      where: { customerCode: value.customer_code, status: 'verifying' },
    });
    if (!row) return false;
    const account = payload(row),
      user = await this.ledger.db.user.findUniqueOrThrow({
        where: { id: row.userId },
      });
    const bvn = decryptPii(Buffer.from(user.bvnCiphertext ?? []), 'bvn');
    if (
      value.identification.bank_code !== account.bankCode ||
      !matchesMask(
        account.accountNumber,
        value.identification.account_number,
      ) ||
      !matchesMask(bvn, value.identification.bvn)
    )
      throw new BadRequestException(
        'Bank change verification does not match the requested account.',
      );
    const failed = event.endsWith('.failed'),
      provider = this.provider();
    if (
      !failed &&
      (!provider.verifyPayoutCustomer ||
        !(await provider.verifyPayoutCustomer(
          value.customer_code,
          decryptPii(Buffer.from(user.emailCiphertext ?? []), 'email'),
        )))
    )
      throw new ConflictException('Bank verification is not confirmed.');
    await this.ledger.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${row.userId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${row.sessionId}::uuid FOR UPDATE`;
      const current = await tx.withdrawalBankChange.findUniqueOrThrow({
        where: { id: row.id },
      });
      if (current.status !== 'verifying') return;
      const actor = await tx.user.findUniqueOrThrow({
          where: { id: row.userId },
        }),
        session = await tx.authSession.findUnique({
          where: { id: row.sessionId },
        });
      if (
        failed ||
        actor.status !== 'active' ||
        actor.role !== 'buyer' ||
        !actor.emailVerifiedAt ||
        current.passwordSnapshot !==
          hashPii(actor.buyerPasswordHash ?? '', 'bank-change-password') ||
        current.bvnHash !== actor.bvnHash ||
        !session ||
        !session.buyerMfa ||
        session.userId !== row.userId ||
        session.revokedAt ||
        session.expiresAt <= new Date()
      ) {
        await tx.withdrawalBankChange.update({
          where: { id: row.id },
          data: { status: 'rejected' },
        });
        return;
      }
      await this.noOutstanding(tx, row.userId);
      const source = await tx.withdrawalBank.findFirst({
        where: { id: row.sourceBankId, userId: row.userId, isCurrent: true },
      });
      if (!source || !current.targetBankId)
        throw new ConflictException('Bank selection changed. Contact support.');
      const target = await tx.withdrawalBank.findUniqueOrThrow({
        where: { id: current.targetBankId },
      });
      if (
        target.userId !== row.userId ||
        target.accountHash !== row.accountHash ||
        target.status === 'rejected'
      )
        throw new ConflictException();
      if (target.status === 'pending')
        await tx.withdrawalBank.update({
          where: { id: target.id },
          data: {
            status: 'verified',
            verifiedAt: new Date(),
            customerCode: target.customerCode ?? value.customer_code,
          },
        });
      await tx.withdrawalBank.update({
        where: { id: source.id },
        data: { isCurrent: false },
      });
      await tx.withdrawalBank.update({
        where: { id: target.id },
        data: { isCurrent: true },
      });
      await tx.withdrawalBankChange.update({
        where: { id: row.id },
        data: { status: 'complete' },
      });
    });
    return true;
  }
}
