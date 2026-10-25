import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  quoteBankTransfer,
  virtualAccountInputSchema,
  virtualAccountSchema,
  type VirtualAccountInput,
  paymentHistorySchema,
  walletHistoryInputSchema,
  walletCursorSchema,
  fromLedgerKobo,
  type WalletHistoryInput,
} from '@auction-ng/shared';
import { LedgerService } from '../ledger/ledger-service';
import { decryptPii, encryptPii, hashPii } from '../security/pii';
import type { PaymentProvider, VerifiedTransfer } from './payment-provider';

export class PaymentService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly provider?: PaymentProvider,
  ) {}
  private enabled() {
    if (!this.provider)
      throw new ServiceUnavailableException(
        'Configure a Paystack test key first.',
      );
    return this.provider;
  }
  async assignAccount(userId: string, input: VirtualAccountInput) {
    const parsed = virtualAccountInputSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException();
    const provider = this.enabled();
    const user = await this.ledger.db.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!user.emailVerifiedAt || !user.emailCiphertext)
      throw new ForbiddenException();
    const existing = await this.ledger.db.virtualAccount.findFirst({
      where: { userId, provider: 'paystack', customerCode: { not: null } },
    });
    if (existing) return this.getAccount(userId);
    await this.ledger.db.user.update({
      where: { id: userId },
      data: {
        walletConsentedAt: new Date(),
        topupFeePolicy: input.feePolicy,
        kycStatus: 'pending',
        bvnHash: hashPii(input.bvn, 'bvn'),
        bvnCiphertext: encryptPii(input.bvn, 'bvn'),
      },
    });
    // Save consent before disclosing personal information to the provider.
    await this.ledger.openWallet(userId);
    const email = decryptPii(Buffer.from(user.emailCiphertext), 'email');
    if (!(await provider.getAccount(email)))
      await provider.assignAccount({ ...parsed.data, email });
    return this.getAccount(userId);
  }
  async getAccount(userId: string) {
    const user = await this.ledger.db.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!user.walletConsentedAt || !user.emailCiphertext)
      return { status: 'not_requested' as const };
    let account = await this.ledger.db.virtualAccount.findFirst({
      where: { userId, provider: 'paystack', customerCode: { not: null } },
    });
    if (!account) {
      const remote = await this.enabled().getAccount(
        decryptPii(Buffer.from(user.emailCiphertext), 'email'),
      );
      if (!remote || !remote.identified) return { status: 'pending' as const };
      await this.ledger.db.virtualAccount.createMany({
        skipDuplicates: true,
        data: {
          userId,
          provider: 'paystack',
          providerRef: remote.customerCode,
          customerCode: remote.customerCode,
          bankName: remote.bankName,
          accountNumberCiphertext: encryptPii(
            remote.accountNumber,
            'virtual-account',
          ),
          consentedAt: user.walletConsentedAt,
        },
      });
      account = await this.ledger.db.virtualAccount.findUniqueOrThrow({
        where: { customerCode: remote.customerCode },
      });
      if (account.userId !== userId) throw new ConflictException();
      await this.ledger.db.user.update({
        where: { id: userId },
        data: { kycStatus: 'verified' },
      });
    }
    return virtualAccountSchema.parse({
      bankName: account.bankName,
      accountNumber: decryptPii(
        Buffer.from(account.accountNumberCiphertext),
        'virtual-account',
      ),
      currency: 'NGN',
      testMode: true,
    });
  }
  async webhook(raw: Buffer, signature: string) {
    const provider = this.enabled();
    if (!provider.verifySignature(raw, signature))
      throw new UnauthorizedException();
    let event: { event: string; data: unknown };
    try {
      event = z
        .object({ event: z.string(), data: z.unknown() })
        .parse(JSON.parse(raw.toString('utf8')));
    } catch {
      throw new BadRequestException();
    }
    if (event.event !== 'charge.success') return;
    const parsed = z
      .object({ reference: z.string().min(1).max(160) })
      .safeParse(event.data);
    if (!parsed.success) throw new BadRequestException();
    await this.credit(
      await provider.verifyTransfer(parsed.data.reference),
      parsed.data.reference,
    );
  }
  private async credit(transfer: VerifiedTransfer, reference: string) {
    if (
      transfer.reference !== reference ||
      transfer.domain !== 'test' ||
      transfer.status !== 'success' ||
      transfer.currency !== 'NGN' ||
      transfer.channel !== 'dedicated_nuban'
    )
      throw new BadRequestException('Transfer could not be verified.');
    let quote: ReturnType<typeof quoteBankTransfer>;
    try {
      quote = quoteBankTransfer(transfer.amountKobo);
    } catch {
      throw new BadRequestException();
    }
    if (
      !Number.isSafeInteger(transfer.feeKobo) ||
      quote.feeKobo !== transfer.feeKobo
    )
      throw new ConflictException(
        'Provider fee differs from the disclosed fee. Contact support.',
      );
    const account = await this.ledger.db.virtualAccount.findUnique({
      where: { customerCode: transfer.customerCode },
    });
    if (!account)
      throw new ConflictException('Transfer account is not linked.');
    const user = await this.ledger.db.user.findUniqueOrThrow({
      where: { id: account.userId },
    });
    if (!user.walletConsentedAt || user.topupFeePolicy !== quote.feePolicy)
      throw new ForbiddenException();
    const wallet = await this.ledger.db.wallet.findUniqueOrThrow({
      where: { userId: user.id },
    });
    await this.ledger.db.payment.createMany({
      skipDuplicates: true,
      data: {
        userId: user.id,
        walletId: wallet.id,
        provider: 'paystack',
        providerRef: reference,
        amountKobo: BigInt(quote.transferKobo),
        feeKobo: BigInt(quote.feeKobo),
        creditKobo: BigInt(quote.creditKobo),
        verifiedAt: new Date(),
      },
    });
    const payment = await this.ledger.db.payment.findUniqueOrThrow({
      where: {
        provider_providerRef: { provider: 'paystack', providerRef: reference },
      },
    });
    if (
      payment.walletId !== wallet.id ||
      payment.amountKobo !== BigInt(quote.transferKobo) ||
      payment.feeKobo !== BigInt(quote.feeKobo) ||
      payment.creditKobo !== BigInt(quote.creditKobo)
    )
      throw new ConflictException('Provider reference changed.');
    // Deterministic keys recover safely if the process stops before updating status.
    const key = `paystack:${createHash('sha256').update(reference).digest('hex')}`;
    await this.ledger.topup({
      walletId: wallet.id,
      amountKobo: BigInt(quote.creditKobo),
      idempotencyKey: key,
      reference: key,
    });
    await this.ledger.db.payment.update({
      where: { id: payment.id },
      data: { status: 'credited' },
    });
  }
  async history(userId: string, input: WalletHistoryInput) {
    const parsed = walletHistoryInputSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException();
    let boundary: { id: string; createdAt: string } | undefined;
    if (parsed.data.cursor)
      try {
        boundary = walletCursorSchema.parse(
          JSON.parse(
            Buffer.from(parsed.data.cursor, 'base64url').toString('utf8'),
          ),
        );
      } catch {
        throw new BadRequestException();
      }
    const rows = await this.ledger.db.payment.findMany({
      where: {
        userId,
        provider: 'paystack',
        feeKobo: { not: null },
        creditKobo: { not: null },
        ...(boundary
          ? {
              OR: [
                { createdAt: { lt: new Date(boundary.createdAt) } },
                {
                  createdAt: new Date(boundary.createdAt),
                  id: { lt: boundary.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: parsed.data.limit + 1,
    });
    const page = rows.slice(0, parsed.data.limit);
    const last = page.at(-1);
    return paymentHistorySchema.parse({
      items: page.map((row) => ({
        id: row.id,
        transferKobo: fromLedgerKobo(row.amountKobo),
        feeKobo: fromLedgerKobo(row.feeKobo ?? 0n),
        creditKobo: fromLedgerKobo(row.creditKobo ?? 0n),
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor:
        rows.length > parsed.data.limit && last
          ? Buffer.from(
              JSON.stringify({
                id: last.id,
                createdAt: last.createdAt.toISOString(),
              }),
            ).toString('base64url')
          : null,
    });
  }
  async reconcile(from: Date, to: Date) {
    const provider = this.enabled();
    const mismatches: { reference: string; reason: string }[] = [];
    const references = await provider.listTransfers(from, to);
    for (const reference of new Set(references)) {
      try {
        const transfer = await provider.verifyTransfer(reference);
        const owner = await this.ledger.db.virtualAccount.findUnique({
          where: { customerCode: transfer.customerCode },
        });
        const payment = await this.ledger.db.payment.findUnique({
          where: {
            provider_providerRef: {
              provider: 'paystack',
              providerRef: reference,
            },
          },
        });
        const key = `paystack:${createHash('sha256').update(reference).digest('hex')}`;
        const journal = await this.ledger.receiptForKey(key);
        if (
          !payment ||
          !owner ||
          owner.userId !== payment.userId ||
          transfer.reference !== reference ||
          payment.status !== 'credited' ||
          !journal ||
          journal.walletId !== payment.walletId ||
          journal.operation !== 'topup' ||
          journal.amountKobo !== payment.creditKobo ||
          payment.amountKobo !== BigInt(transfer.amountKobo) ||
          payment.feeKobo !== BigInt(transfer.feeKobo) ||
          transfer.domain !== 'test' ||
          transfer.status !== 'success' ||
          transfer.currency !== 'NGN' ||
          transfer.channel !== 'dedicated_nuban'
        )
          mismatches.push({
            reference,
            reason: 'Provider payment and wallet credit do not match.',
          });
      } catch {
        mismatches.push({
          reference,
          reason: 'Provider verification unavailable or invalid.',
        });
      }
    }
    // Also find local records absent from the provider response.
    let cursor: string | undefined;
    do {
      const page = await this.ledger.db.payment.findMany({
        where: { provider: 'paystack', createdAt: { gte: from, lt: to } },
        orderBy: { id: 'asc' },
        take: 50,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      for (const payment of page)
        if (!references.includes(payment.providerRef))
          mismatches.push({
            reference: payment.providerRef,
            reason: 'Local payment is absent from provider results.',
          });
      cursor = page.length === 50 ? page.at(-1)?.id : undefined;
    } while (cursor);
    const report = {
      from: from.toISOString(),
      to: to.toISOString(),
      checked: references.length,
      mismatches,
    };
    await this.ledger.db.auditLog.create({
      data: {
        action: 'payments.reconciliation',
        entityType: 'reconciliation',
        entityId: from.toISOString(),
        afterCiphertext: encryptPii(JSON.stringify(report), 'reconciliation'),
      },
    });
    return {
      from: report.from,
      to: report.to,
      checked: report.checked,
      mismatchCount: mismatches.length,
      mismatches,
    };
  }
}
