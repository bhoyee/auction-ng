import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  calculateFixedPrice,
  quotePurchasePayment,
  fromLedgerKobo,
  isBuyerEligible,
  PURCHASE_RESERVATION_MS,
  purchaseInputSchema,
  purchaseStatusSchema,
  type PurchaseInput,
} from '@auction-ng/shared';
import type { Purchase, Prisma } from '../generated/prisma/client';
import { LedgerService } from '../ledger/ledger-service';
import { BidService } from '../bids/bid-service';
import type {
  PaymentProvider,
  VerifiedTransfer,
} from '../payments/payment-provider';
import { decryptPii, encryptPii, hashPii } from '../security/pii';

type Identity = { userId: string; sessionId: string };
export class PurchaseService {
  private cursor: string | undefined;
  constructor(
    private readonly ledger: LedgerService,
    private readonly bids: BidService,
    private readonly provider?: PaymentProvider,
  ) {}
  private async eligible(tx: Prisma.TransactionClient, identity: Identity) {
    await tx.$queryRaw`SELECT id FROM users WHERE id=${identity.userId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${identity.sessionId}::uuid FOR UPDATE`;
    const session = await tx.authSession.findUnique({
      where: { id: identity.sessionId },
      include: {
        user: { include: { strikes: { where: { revokedAt: null }, take: 3 } } },
      },
    });
    if (
      !session ||
      session.userId !== identity.userId ||
      session.revokedAt ||
      session.accessExpiresAt <= new Date() ||
      session.expiresAt <= new Date() ||
      session.user.strikes.length >= 3 ||
      !isBuyerEligible({
        role: session.user.role,
        status: session.user.status,
        emailVerified: session.user.emailVerifiedAt !== null,
      })
    )
      throw new ForbiddenException(
        'An active verified buyer account is required.',
      );
  }
  async start(identity: Identity, lotId: string, input: PurchaseInput) {
    const request = purchaseInputSchema.parse(input);
    if (request.method !== 'wallet' && !this.provider)
      throw new ServiceUnavailableException(
        'Card and transfer checkout need a configured test payment provider.',
      );
    const wallet = await this.ledger.openWallet(identity.userId);
    const id = randomUUID();
    const purchase = await this.ledger.db
      .$transaction(
        async (tx) => {
          await this.eligible(tx, identity);
          await tx.$queryRaw`SELECT id FROM lots WHERE id=${lotId}::uuid FOR UPDATE`;
          const previous = await tx.purchase.findUnique({
            where: {
              userId_requestKey: {
                userId: identity.userId,
                requestKey: request.idempotencyKey,
              },
            },
          });
          if (previous) {
            if (
              previous.lotId !== lotId ||
              previous.method !== request.method ||
              previous.priceKobo !== BigInt(request.acceptedPriceKobo) ||
              previous.taxKobo !== BigInt(request.acceptedTaxKobo) ||
              previous.processingFeeKobo !==
                BigInt(request.acceptedProcessingFeeKobo) ||
              previous.amountKobo !== BigInt(request.acceptedTotalKobo)
            )
              throw new ConflictException(
                'This retry key belongs to a different purchase.',
              );
            return previous;
          }
          const lot = await tx.lot.findUnique({ where: { id: lotId } });
          if (
            !lot ||
            !lot.fixedPriceKobo ||
            !['open', 'closing'].includes(lot.status) ||
            lot.startAt > new Date() ||
            lot.endAt <= new Date()
          )
            throw new ConflictException(
              'This item is no longer available for immediate purchase.',
            );
          const quote = calculateFixedPrice(fromLedgerKobo(lot.fixedPriceKobo));
          const payment =
            request.method === 'wallet'
              ? {
                  amountKobo: quote.totalKobo,
                  feeKobo: 0,
                  creditKobo: quote.totalKobo,
                }
              : quotePurchasePayment(quote.totalKobo, request.method);
          if (
            quote.priceKobo !== request.acceptedPriceKobo ||
            quote.taxKobo !== request.acceptedTaxKobo ||
            payment.feeKobo !== request.acceptedProcessingFeeKobo ||
            payment.amountKobo !== request.acceptedTotalKobo
          )
            throw new ConflictException(
              'The price or payment charges changed. Review the latest total.',
            );
          // Expiring rows under the lot lock makes the partial unique index a durable single-reservation guard.
          await tx.purchase.updateMany({
            where: { lotId, status: 'pending', expiresAt: { lte: new Date() } },
            data: { status: 'expired' },
          });
          if (
            await tx.purchase.findFirst({
              where: { lotId, status: { in: ['pending', 'paid'] } },
            })
          )
            throw new ConflictException(
              'Another buyer has reserved or purchased this item.',
            );
          const gate = await this.bids.purchaseGate(
            lotId,
            id,
            'reserve',
            Math.min(lot.endAt.getTime(), Date.now() + PURCHASE_RESERVATION_MS),
          );
          if (gate.status !== 'ok' || !gate.expiresAt)
            throw new ConflictException('This item is reserved or has ended.');
          return tx.purchase.create({
            data: {
              id,
              lotId,
              userId: identity.userId,
              walletId: wallet.id,
              namespace: this.bids.prefix,
              requestKey: request.idempotencyKey,
              method: request.method,
              priceKobo: BigInt(quote.priceKobo),
              taxKobo: BigInt(quote.taxKobo),
              totalKobo: BigInt(quote.totalKobo),
              amountKobo: BigInt(payment.amountKobo),
              processingFeeKobo: BigInt(payment.feeKobo),
              creditKobo: BigInt(payment.creditKobo),
              expiresAt: new Date(gate.expiresAt),
              providerRef: `auction-buy-${id}`,
            },
          });
        },
        { timeout: 15000 },
      )
      .catch(async (error: unknown) => {
        // Release a transient gate only after a successful DB read proves the intent did not commit.
        const committed = await this.ledger.db.purchase.findUnique({
          where: { id },
        });
        if (!committed) await this.bids.purchaseGate(lotId, id, 'release');
        throw error;
      });
    if (purchase.status === 'pending' && purchase.method === 'wallet') {
      try {
        await this.complete(purchase.id, identity);
      } catch (error) {
        await this.cancel(identity.userId, purchase.id);
        throw error;
      }
    } else if (purchase.status === 'pending' && !purchase.checkoutUrlCiphertext)
      await this.initialize(purchase);
    return this.get(identity.userId, purchase.id);
  }
  private async initialize(purchase: Purchase) {
    const claimed = await this.ledger.db.purchase.updateMany({
      where: {
        id: purchase.id,
        initializationAttemptedAt: null,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
      data: { initializationAttemptedAt: new Date() },
    });
    if (!claimed.count) return;
    if (!this.provider) throw new ServiceUnavailableException();
    const user = await this.ledger.db.user.findUniqueOrThrow({
      where: { id: purchase.userId },
    });
    if (!user.emailCiphertext) throw new ForbiddenException();
    const checkout = await this.provider.initializeCard({
      email: decryptPii(Buffer.from(user.emailCiphertext), 'email'),
      reference: purchase.providerRef,
      amountKobo: fromLedgerKobo(purchase.amountKobo),
      channel: purchase.method === 'bank_transfer' ? 'bank_transfer' : 'card',
    });
    await this.ledger.db.purchase.update({
      where: { id: purchase.id },
      data: {
        checkoutUrlCiphertext: encryptPii(
          checkout.authorizationUrl,
          'purchase-checkout',
        ),
      },
    });
  }
  async get(userId: string, id: string) {
    const row = await this.ledger.db.purchase.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException();
    if (row.status === 'pending' && row.expiresAt <= new Date())
      await this.expire(row);
    const current = await this.ledger.db.purchase.findUniqueOrThrow({
      where: { id },
    });
    return purchaseStatusSchema.parse({
      id,
      lotId: current.lotId,
      method: current.method,
      status: current.status,
      priceKobo: fromLedgerKobo(current.priceKobo),
      taxKobo: fromLedgerKobo(current.taxKobo),
      totalKobo: fromLedgerKobo(current.totalKobo),
      amountKobo: fromLedgerKobo(current.amountKobo),
      processingFeeKobo: fromLedgerKobo(current.processingFeeKobo),
      expiresAt: current.expiresAt.toISOString(),
      invoiceId: current.invoiceId,
      authorizationUrl:
        current.status === 'pending' && current.checkoutUrlCiphertext
          ? decryptPii(
              Buffer.from(current.checkoutUrlCiphertext),
              'purchase-checkout',
            )
          : null,
      fundsCredited: current.creditedAt !== null,
    });
  }
  private async expire(row: Purchase) {
    const result = await this.ledger.db.purchase.updateMany({
      where: { id: row.id, status: 'pending', expiresAt: { lte: new Date() } },
      data: { status: 'expired' },
    });
    if (result.count)
      await this.bids.purchaseGate(row.lotId, row.id, 'release');
  }
  async cancel(userId: string, id: string) {
    const row = await this.ledger.db.purchase.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException();
    await this.ledger.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM purchases WHERE id=${id}::uuid FOR UPDATE`;
      const current = await tx.purchase.findUniqueOrThrow({ where: { id } });
      if (current.status !== 'pending') return;
      await tx.purchase.update({
        where: { id },
        data: { status: 'cancelled' },
      });
    });
    const current = await this.ledger.db.purchase.findUniqueOrThrow({
      where: { id },
    });
    if (current.status !== 'paid')
      await this.bids.purchaseGate(row.lotId, id, 'release');
    return this.get(userId, id);
  }
  async confirm(userId: string, id: string) {
    const row = await this.ledger.db.purchase.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException();
    if (row.method !== 'wallet' && row.status !== 'paid') {
      if (!this.provider) throw new ServiceUnavailableException();
      const verified = await this.provider.verifyTransfer(row.providerRef);
      if (verified.status === 'success')
        await this.handlePayment(verified, row.providerRef);
    }
    return this.get(userId, id);
  }
  async handlePayment(transfer: VerifiedTransfer, reference: string) {
    const row = await this.ledger.db.purchase.findUnique({
      where: { providerRef: reference },
    });
    if (!row) return false;
    const user = await this.ledger.db.user.findUniqueOrThrow({
      where: { id: row.userId },
    });
    const expectedChannel =
      row.method === 'bank_transfer' ? 'bank_transfer' : 'card';
    if (
      row.method === 'wallet' ||
      transfer.reference !== reference ||
      transfer.status !== 'success' ||
      transfer.domain !== 'test' ||
      transfer.currency !== 'NGN' ||
      transfer.channel !== expectedChannel ||
      !transfer.customerEmail ||
      hashPii(transfer.customerEmail.trim().toLowerCase(), 'email') !==
        user.emailHash ||
      !Number.isSafeInteger(transfer.amountKobo) ||
      BigInt(transfer.amountKobo) !== row.amountKobo ||
      transfer.feeKobo === null ||
      !Number.isSafeInteger(transfer.feeKobo) ||
      BigInt(transfer.feeKobo) !== row.processingFeeKobo ||
      (expectedChannel === 'card' &&
        (!transfer.cardCountry ||
          (transfer.cardCountry === 'NG') !== (row.method === 'local_card')))
    )
      throw new BadRequestException(
        'Payment does not match the accepted checkout.',
      );
    await this.ledger.db.purchase.updateMany({
      where: { id: row.id, verifiedAt: null },
      data: { verifiedAt: new Date() },
    });
    await this.ledger.topup({
      walletId: row.walletId,
      amountKobo: row.creditKobo,
      idempotencyKey: `purchase:credit:${row.id}`,
      reference: `purchase:credit:${row.id}`,
    });
    await this.ledger.db.purchase.updateMany({
      where: { id: row.id, creditedAt: null },
      data: { creditedAt: new Date() },
    });
    const current = await this.ledger.db.purchase.findUniqueOrThrow({
      where: { id: row.id },
    });
    if (current.status === 'pending' && current.expiresAt > new Date())
      await this.complete(row.id);
    else if (current.status === 'pending') await this.expire(current);
    return true;
  }
  private async complete(id: string, identity?: Identity) {
    const row = await this.ledger.db.purchase.findUniqueOrThrow({
      where: { id },
    });
    if (row.namespace !== this.bids.prefix)
      throw new ConflictException('Purchase engine recovery needs review.');
    if (row.status === 'paid') {
      await this.finish(row);
      return;
    }
    if (row.status !== 'pending' || row.expiresAt <= new Date()) {
      await this.expire(row);
      return;
    }
    const gate = await this.bids.purchaseGate(row.lotId, id, 'commit');
    if (gate.status !== 'ok' || !gate.barrierId)
      throw new ConflictException(
        'The reservation expired or auction closed. Check your wallet before retrying.',
      );
    await this.bids.persistThrough(gate.barrierId);
    await this.ledger.db.$transaction(
      async (tx) => {
        if (identity) await this.eligible(tx, identity);
        else {
          await tx.$queryRaw`SELECT id FROM users WHERE id=${row.userId}::uuid FOR UPDATE`;
          const user = await tx.user.findUniqueOrThrow({
            where: { id: row.userId },
            include: { strikes: { where: { revokedAt: null }, take: 3 } },
          });
          if (
            !isBuyerEligible({
              role: user.role,
              status: user.status,
              emailVerified: user.emailVerifiedAt !== null,
            }) ||
            user.strikes.length >= 3
          )
            throw new ForbiddenException();
        }
        await tx.$queryRaw`SELECT id FROM lots WHERE id=${row.lotId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM purchases WHERE id=${id}::uuid FOR UPDATE`;
        const current = await tx.purchase.findUniqueOrThrow({ where: { id } });
        if (current.status === 'paid') return;
        if (
          current.status !== 'pending' ||
          current.expiresAt <= new Date() ||
          (current.method !== 'wallet' && !current.creditedAt)
        )
          throw new ConflictException('Reservation no longer payable.');
        const lot = await tx.lot.findUniqueOrThrow({
          where: { id: current.lotId },
        });
        if (
          !['open', 'closing'].includes(lot.status) ||
          (await tx.lotSettlement.findUnique({ where: { lotId: lot.id } }))
        )
          throw new ConflictException('The auction already closed.');
        const own = await tx.bidFundingIntent.findMany({
          where: {
            lotId: lot.id,
            userId: current.userId,
            namespace: current.namespace,
            status: { not: 'released' },
          },
          orderBy: { id: 'asc' },
        });
        for (const intent of own)
          if (intent.holdId)
            await this.ledger.releaseInTransaction(tx, {
              walletId: current.walletId,
              holdId: intent.holdId,
              idempotencyKey: `bid:release:${intent.id}`,
              reference: `bid:release:${intent.id}`,
            });
        await this.ledger.debitInTransaction(tx, {
          walletId: current.walletId,
          amountKobo: current.totalKobo,
          idempotencyKey: `purchase:debit:${id}`,
          reference: `purchase:debit:${id}`,
        });
        await tx.bidFundingIntent.updateMany({
          where: { id: { in: own.map((i) => i.id) } },
          data: { status: 'released' },
        });
        const amounts = {
          premiumKobo: 0n,
          lotFeeKobo: 0n,
          vatKobo: current.taxKobo,
          totalKobo: current.totalKobo,
        };
        const invoice = await tx.invoice.create({
          data: {
            userId: current.userId,
            status: 'paid',
            hammerTotalKobo: current.priceKobo,
            ...amounts,
            lines: {
              create: {
                lotId: lot.id,
                hammerKobo: current.priceKobo,
                ...amounts,
              },
            },
          },
        });
        const token = randomBytes(32).toString('base64url');
        await tx.fulfilment.create({
          data: {
            invoiceId: invoice.id,
            userId: current.userId,
            locationId: lot.locationId,
            qrTokenHash: createHash('sha256').update(token).digest('hex'),
            qrTokenCiphertext: encryptPii(token, 'pickup-pass'),
          },
        });
        await tx.purchase.update({
          where: { id },
          data: { status: 'paid', invoiceId: invoice.id },
        });
        await tx.lot.update({
          where: { id: lot.id },
          data: { status: 'closed', endAt: new Date() },
        });
        const buyer = await tx.user.findUniqueOrThrow({
          where: { id: current.userId },
        });
        const location = await tx.location.findUniqueOrThrow({
          where: { id: lot.locationId },
        });
        await tx.notification.create({
          data: {
            userId: current.userId,
            reference: `purchase:${id}:paid`,
            channel: 'email',
            template: 'auction-result-v1',
            payloadCiphertext: encryptPii(
              JSON.stringify({
                emailCiphertext: buyer.emailCiphertext
                  ? Buffer.from(buyer.emailCiphertext).toString('base64')
                  : null,
                message: {
                  saleType: 'fixed_price',
                  purchaseMethod:
                    current.method === 'wallet'
                      ? 'wallet'
                      : current.method === 'bank_transfer'
                        ? 'bank_transfer'
                        : 'card',
                  invoiceNumber: invoice.number,
                  title: lot.title,
                  lotNumber: lot.lotNumber,
                  hammerKobo: fromLedgerKobo(current.priceKobo),
                  premiumKobo: 0,
                  lotFeeKobo: 0,
                  vatKobo: fromLedgerKobo(current.taxKobo),
                  totalKobo: fromLedgerKobo(current.totalKobo),
                  location: location.name,
                  address: location.address,
                  status: 'paid',
                  deadline: null,
                },
              }),
              'notification',
            ),
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: current.userId,
            action: 'purchases.paid',
            entityType: 'lot',
            entityId: lot.id,
            afterCiphertext: encryptPii(
              JSON.stringify({ purchaseId: id, invoiceId: invoice.id }),
              'audit',
            ),
          },
        });
      },
      { timeout: 15000, maxWait: 60000 },
    );
    await this.finish(
      await this.ledger.db.purchase.findUniqueOrThrow({ where: { id } }),
    );
  }
  private async finish(row: Purchase) {
    if (row.status !== 'paid' || row.holdsReleasedAt) return;
    const gate = await this.bids.purchaseGate(row.lotId, row.id, 'sold');
    if (gate.status !== 'sold')
      throw new ConflictException(
        'Purchase finalisation needs recovery review.',
      );
    const intents = await this.ledger.db.bidFundingIntent.findMany({
      where: {
        lotId: row.lotId,
        namespace: row.namespace,
        status: { not: 'released' },
      },
      orderBy: { id: 'asc' },
      take: 50,
    });
    for (const intent of intents) {
      if (intent.holdId)
        await this.ledger.releaseHold({
          walletId: intent.walletId,
          holdId: intent.holdId,
          idempotencyKey: `bid:release:${intent.id}`,
          reference: `bid:release:${intent.id}`,
        });
      await this.ledger.db.bidFundingIntent.update({
        where: { id: intent.id },
        data: { status: 'released' },
      });
    }
    if (intents.length < 50)
      await this.ledger.db.purchase.updateMany({
        where: { id: row.id, status: 'paid', holdsReleasedAt: null },
        data: { holdsReleasedAt: new Date() },
      });
  }
  async maintain() {
    const rows = await this.ledger.db.purchase.findMany({
      where: {
        namespace: this.bids.prefix,
        OR: [{ status: 'pending' }, { status: 'paid', holdsReleasedAt: null }],
        ...(this.cursor ? { id: { gt: this.cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: 50,
    });
    this.cursor = rows.length === 50 ? rows.at(-1)?.id : undefined;
    for (const row of rows) {
      try {
        if (row.status === 'paid') await this.finish(row);
        else if (row.expiresAt <= new Date()) await this.expire(row);
        else if (row.creditedAt || row.method === 'wallet')
          await this.complete(row.id);
      } catch {
        /* Keep reservations fenced; retry until expiry without double charging. */
      }
    }
  }
}
