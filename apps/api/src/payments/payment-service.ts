import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { paymentReturnUrl } from './payment-return-url';
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
  quoteCardFunding,
  cardFundingInputSchema,
  cardCheckoutSchema,
  type CardFundingInput,
  fundingRefundInputSchema,
  fundingRefundSchema,
  type FundingRefundInput,
  paymentBankPageSchema,
  pageInputSchema,
  type PageInput,
} from '@auction-ng/shared';
import { LedgerService } from '../ledger/ledger-service';
import { decryptPii, encryptPii, hashPii } from '../security/pii';
import type { PaymentProvider, VerifiedTransfer } from './payment-provider';
import type { Payment } from '../generated/prisma/client';

export class PaymentService {
  handlePurchasePayment?: (
    transfer: VerifiedTransfer,
    reference: string,
  ) => Promise<boolean>;
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
  async banks(input: PageInput) {
    const provider = this.enabled();
    if (!provider.listBanks)
      throw new ServiceUnavailableException(
        'Bank selection is unavailable. Try again later.',
      );
    return paymentBankPageSchema.parse(
      await provider.listBanks(pageInputSchema.parse(input)),
    );
  }
  async initializeCard(userId: string, input: CardFundingInput) {
    const parsed = cardFundingInputSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException();
    const request = parsed.data;
    let quote: ReturnType<typeof quoteCardFunding>;
    try {
      quote = quoteCardFunding(request.amountKobo, request.cardType);
    } catch {
      throw new BadRequestException();
    }
    if (
      request.feePolicy !== quote.feePolicy ||
      request.acceptedFeeKobo !== quote.feeKobo ||
      request.acceptedCreditKobo !== quote.creditKobo
    )
      throw new ConflictException(
        'Accept the current fee and wallet credit before checkout.',
      );
    const provider = this.enabled();
    const user = await this.ledger.db.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!user.emailVerifiedAt || !user.emailCiphertext)
      throw new ForbiddenException();
    const email = decryptPii(Buffer.from(user.emailCiphertext), 'email');
    const wallet = await this.ledger.openWallet(userId);
    const key = `${userId}:${request.idempotencyKey}`;
    const reference = `auction-card-${createHash('sha256').update(key).digest('hex')}`;
    // Persist intent before contacting Paystack so a later webhook can recover it.
    await this.ledger.db.payment.createMany({
      skipDuplicates: true,
      data: {
        userId,
        walletId: wallet.id,
        provider: 'paystack',
        providerRef: reference,
        amountKobo: BigInt(quote.amountKobo),
        feeKobo: BigInt(quote.feeKobo),
        creditKobo: BigInt(quote.creditKobo),
        fundingMethod: 'card',
        cardType: quote.cardType,
        feePolicy: quote.feePolicy,
        initializationKey: key,
        consentedAt: new Date(),
      },
    });
    const result = await this.ledger.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},513))`;
        const payment = await tx.payment.findUniqueOrThrow({
          where: { initializationKey: key },
        });
        if (
          payment.userId !== userId ||
          payment.walletId !== wallet.id ||
          payment.fundingMethod !== 'card' ||
          payment.amountKobo !== BigInt(quote.amountKobo) ||
          payment.feeKobo !== BigInt(quote.feeKobo) ||
          payment.creditKobo !== BigInt(quote.creditKobo) ||
          payment.cardType !== quote.cardType ||
          payment.feePolicy !== quote.feePolicy
        )
          throw new ConflictException(
            'The retry key belongs to another checkout request.',
          );
        if (payment.checkoutUrlCiphertext)
          return cardCheckoutSchema.parse({
            ...quote,
            paymentId: payment.id,
            authorizationUrl: decryptPii(
              Buffer.from(payment.checkoutUrlCiphertext),
              'card-checkout',
            ),
          });
        if (payment.initializationAttemptedAt)
          throw new ConflictException(
            'Checkout status is uncertain. Check payment status before starting another payment.',
          );
        const callbackUrl = paymentReturnUrl('wallet', payment.id);
        await tx.payment.update({
          where: { id: payment.id },
          data: { initializationAttemptedAt: new Date() },
        });
        let checkout: { authorizationUrl: string };
        try {
          checkout = await provider.initializeCard({
            callbackUrl,
            email,
            reference,
            amountKobo: quote.amountKobo,
          });
        } catch {
          return null;
        }
        const reply = cardCheckoutSchema.parse({
          ...quote,
          paymentId: payment.id,
          authorizationUrl: checkout.authorizationUrl,
        });
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            checkoutUrlCiphertext: encryptPii(
              reply.authorizationUrl,
              'card-checkout',
            ),
          },
        });
        return reply;
      },
      { maxWait: 60000, timeout: 20000 },
    );
    if (!result)
      throw new ServiceUnavailableException(
        'Checkout could not be confirmed. Check payment status before retrying.',
      );
    return result;
  }
  async confirmCard(userId: string, paymentId: string) {
    const payment = await this.ledger.db.payment.findFirst({
      where: { id: paymentId, userId, fundingMethod: 'card' },
    });
    if (!payment) throw new NotFoundException();
    if (payment.status === 'credited')
      return { paymentId, status: 'credited' as const };
    const transfer = await this.enabled().verifyTransfer(payment.providerRef);
    if (
      transfer.reference !== payment.providerRef ||
      transfer.domain !== 'test' ||
      transfer.currency !== 'NGN'
    )
      throw new BadRequestException();
    if (['failed', 'abandoned'].includes(transfer.status)) {
      await this.ledger.db.payment.updateMany({
        where: { id: paymentId, status: { not: 'credited' } },
        data: { status: 'failed' },
      });
      return { paymentId, status: 'failed' as const };
    }
    if (transfer.status !== 'success')
      return { paymentId, status: 'pending' as const };
    await this.credit(transfer, payment.providerRef);
    return { paymentId, status: 'credited' as const };
  }
  private async validateCardPayment(
    transfer: VerifiedTransfer,
    reference: string,
    payment: Payment,
  ) {
    if (
      payment.fundingMethod !== 'card' ||
      !payment.consentedAt ||
      !payment.initializationKey ||
      !['local', 'international'].includes(payment.cardType ?? '')
    )
      throw new ConflictException('No accepted card-funding request exists.');
    const user = await this.ledger.db.user.findUniqueOrThrow({
      where: { id: payment.userId },
    });
    const quote = quoteCardFunding(
      fromLedgerKobo(payment.amountKobo),
      payment.cardType === 'local' ? 'local' : 'international',
    );
    if (
      transfer.reference !== reference ||
      transfer.domain !== 'test' ||
      transfer.status !== 'success' ||
      transfer.currency !== 'NGN' ||
      transfer.channel !== 'card' ||
      !transfer.cardCountry ||
      !/^[A-Z]{2}$/.test(transfer.cardCountry) ||
      (transfer.cardCountry === 'NG') !== (payment.cardType === 'local') ||
      !transfer.customerEmail ||
      hashPii(transfer.customerEmail.trim().toLowerCase(), 'email') !==
        user.emailHash ||
      !Number.isSafeInteger(transfer.amountKobo) ||
      transfer.amountKobo <= 0 ||
      payment.amountKobo !== BigInt(transfer.amountKobo) ||
      payment.feeKobo !== BigInt(quote.feeKobo) ||
      payment.creditKobo !== BigInt(quote.creditKobo) ||
      payment.feePolicy !== quote.feePolicy ||
      transfer.feeKobo !== quote.feeKobo
    )
      throw new ConflictException(
        'Card payment does not match the accepted funding request.',
      );
  }
  private async applyCredit(payment: Payment) {
    if (payment.creditKobo === null) throw new ConflictException();
    const key = `paystack:${createHash('sha256').update(payment.providerRef).digest('hex')}`;
    await this.ledger.topup({
      walletId: payment.walletId,
      amountKobo: payment.creditKobo,
      idempotencyKey: key,
      reference: key,
    });
    await this.ledger.db.payment.update({
      where: { id: payment.id },
      data: { status: 'credited', verifiedAt: new Date() },
    });
  }
  async requestFundingRefund(userId: string, input: FundingRefundInput) {
    const parsed = fundingRefundInputSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException();
    const request = parsed.data;
    const scope = 'funding-refund-request';
    const key = `${userId}:${request.idempotencyKey}`;
    const requestHash = createHash('sha256')
      .update(JSON.stringify(request))
      .digest('hex');
    return this.ledger.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},514))`;
        const previous = await tx.idempotencyKey.findUnique({
          where: { scope_key: { scope, key } },
        });
        if (previous) {
          if (
            previous.userId !== userId ||
            previous.requestHash !== requestHash ||
            !previous.responseCiphertext
          )
            throw new ConflictException();
          return fundingRefundSchema.parse(
            JSON.parse(
              decryptPii(
                Buffer.from(previous.responseCiphertext),
                'funding-refund-request',
              ),
            ),
          );
        }
        const payment = await tx.payment.findFirst({
          where: {
            id: request.paymentId,
            userId,
            provider: 'paystack',
            status: 'credited',
          },
        });
        if (!payment || payment.creditKobo === null)
          throw new NotFoundException();
        const balance = await this.ledger.lockedBalances(tx, payment.walletId);
        if (
          BigInt(request.amountKobo) > payment.creditKobo ||
          BigInt(request.amountKobo) > balance.availableKobo
        )
          throw new ConflictException(
            'The request exceeds the original credit or available funds.',
          );
        const audit = await tx.auditLog.create({
          data: {
            actorId: userId,
            action: 'payments.refund_requested',
            entityType: 'payment',
            entityId: payment.id,
            afterCiphertext: encryptPii(
              JSON.stringify(request),
              'funding-refund-request',
            ),
          },
        });
        const reply = fundingRefundSchema.parse({
          requestId: audit.id,
          paymentId: payment.id,
          amountKobo: request.amountKobo,
          status: 'requested',
          message:
            'Refund requested for review. Funds stay in your wallet until approval.',
        });
        await tx.idempotencyKey.create({
          data: {
            userId,
            scope,
            key,
            requestHash,
            status: 'completed',
            responseCiphertext: encryptPii(
              JSON.stringify(reply),
              'funding-refund-request',
            ),
          },
        });
        return reply;
      },
      { maxWait: 60000, timeout: 15000 },
    );
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
      this.handlePurchasePayment &&
      (await this.handlePurchasePayment(transfer, reference))
    )
      return;
    if (transfer.channel === 'card') {
      const payment = await this.ledger.db.payment.findUnique({
        where: {
          provider_providerRef: {
            provider: 'paystack',
            providerRef: reference,
          },
        },
      });
      if (!payment)
        throw new ConflictException(
          'Card payment is not linked to a funding request.',
        );
      await this.validateCardPayment(transfer, reference, payment);
      return this.applyCredit(payment);
    }
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
        fundingMethod: 'bank_transfer',
        feePolicy: 'paystack-dva-v1',
      },
    });
    const payment = await this.ledger.db.payment.findUniqueOrThrow({
      where: {
        provider_providerRef: { provider: 'paystack', providerRef: reference },
      },
    });
    if (
      payment.walletId !== wallet.id ||
      (payment.fundingMethod !== null &&
        payment.fundingMethod !== 'bank_transfer') ||
      payment.amountKobo !== BigInt(quote.transferKobo) ||
      payment.feeKobo !== BigInt(quote.feeKobo) ||
      payment.creditKobo !== BigInt(quote.creditKobo)
    )
      throw new ConflictException('Provider reference changed.');
    return this.applyCredit(payment);
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
        fundingMethod: row.fundingMethod ?? 'bank_transfer',
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
        if (
          this.handlePurchasePayment &&
          (await this.handlePurchasePayment(transfer, reference))
        )
          continue;
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
        if (payment?.fundingMethod === 'card')
          await this.validateCardPayment(transfer, reference, payment);
        if (
          !payment ||
          (payment.fundingMethod !== 'card' &&
            (!owner || owner.userId !== payment.userId)) ||
          transfer.reference !== reference ||
          payment.status !== 'credited' ||
          !journal ||
          journal.walletId !== payment.walletId ||
          journal.operation !== 'topup' ||
          journal.amountKobo !== payment.creditKobo ||
          payment.amountKobo !== BigInt(transfer.amountKobo) ||
          transfer.feeKobo === null ||
          payment.feeKobo !== BigInt(transfer.feeKobo) ||
          transfer.domain !== 'test' ||
          transfer.status !== 'success' ||
          transfer.currency !== 'NGN' ||
          (payment.fundingMethod === 'card'
            ? transfer.channel !== 'card'
            : transfer.channel !== 'dedicated_nuban')
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
