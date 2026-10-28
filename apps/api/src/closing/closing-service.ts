import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  BID_FEE_VERSION,
  PAYMENT_GRACE_MS,
  calculateInvoiceLine,
  closingSnapshotSchema,
  fromLedgerKobo,
  estimatedTotal,
  unsoldRelistRules,
} from '@auction-ng/shared';
import { LedgerService } from '../ledger/ledger-service';
import { InsufficientFundsError } from '../ledger/ledger-errors';
import { BidService } from '../bids/bid-service';
import type { LotSettlement, Prisma } from '../generated/prisma/client';
import { encryptPii, decryptPii } from '../security/pii';

type Tx = Prisma.TransactionClient;
export class ClosingService {
  private pendingCursor: string | undefined;
  private dueCursor: { endAt: Date; id: string } | undefined;
  constructor(
    private readonly ledger: LedgerService,
    private readonly bids: BidService,
  ) {}
  private async locked(tx: Tx, lotId: string) {
    await tx.$queryRaw`SELECT lot_id FROM lot_settlements WHERE lot_id=${lotId}::uuid FOR UPDATE`;
    return tx.lotSettlement.findUniqueOrThrow({ where: { lotId } });
  }
  async closeLot(lotId: string) {
    let settlement = await this.ledger.db.lotSettlement.findUnique({
      where: { lotId },
    });
    if (!settlement) {
      const snapshot = await this.bids.freezeLot(lotId);
      if (!snapshot) return;
      await this.bids.persistThrough(snapshot.barrierId);
      if (snapshot.feeVersion !== BID_FEE_VERSION)
        throw new ConflictException(
          'Unknown settlement fee policy needs review.',
        );
      if (snapshot.leader) {
        const receipt = await this.ledger.db.bidAcceptance.findUnique({
          where: {
            namespace_streamId: {
              namespace: this.bids.prefix,
              streamId: snapshot.streamId,
            },
          },
        });
        const outcome = receipt?.result as { state?: unknown } | undefined;
        const expected = {
          startPriceKobo: snapshot.startPriceKobo,
          currentPriceKobo: snapshot.currentPriceKobo,
          leader: snapshot.leader,
          endsAt: snapshot.endsAt,
        };
        // Compare individual values with a strict schema rather than JSON property order.
        const state = outcome?.state as typeof expected | undefined;
        if (
          !state ||
          state.startPriceKobo !== expected.startPriceKobo ||
          state.currentPriceKobo !== expected.currentPriceKobo ||
          state.endsAt !== expected.endsAt ||
          state.leader?.bidderId !== expected.leader?.bidderId ||
          state.leader?.maxKobo !== expected.leader?.maxKobo ||
          !snapshot.groupId
        )
          throw new ConflictException('Final bid receipt needs review.');
      } else if (
        snapshot.groupId ||
        snapshot.currentPriceKobo !== null ||
        snapshot.streamId !== '0-0' ||
        (await this.ledger.db.bid.count({ where: { lotId } }))
      )
        throw new ConflictException('Unsold result needs review.');
      // This transaction commits the immutable result BEFORE any invoice/capture transaction.
      settlement = await this.ledger.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM lots WHERE id=${lotId}::uuid FOR UPDATE`;
        const existing = await tx.lotSettlement.findUnique({
          where: { lotId },
        });
        if (existing) return existing;
        const relistLotId = snapshot.leader
          ? null
          : await this.relistUnsold(tx, lotId);
        const row = await tx.lotSettlement.create({
          data: {
            lotId,
            relistLotId,
            namespace: this.bids.prefix,
            winnerId: snapshot.leader?.bidderId ?? null,
            groupId: snapshot.groupId,
            hammerKobo:
              snapshot.currentPriceKobo === null
                ? null
                : BigInt(snapshot.currentPriceKobo),
            feeVersion: snapshot.feeVersion,
            streamId: snapshot.streamId,
            barrierId: snapshot.barrierId,
            endAt: new Date(snapshot.endsAt),
            closedAt: new Date(snapshot.closedAt),
            snapshot,
            status: snapshot.leader ? 'frozen' : 'unsold',
          },
        });
        await tx.lot.update({
          where: { id: lotId },
          data: { status: 'closed', endAt: new Date(snapshot.endsAt) },
        });
        return row;
      });
    }
    if (settlement.namespace !== this.bids.prefix)
      throw new ConflictException('Settlement namespace needs review.');
    await this.bids.releaseClosedPreparations(lotId);
    if (['paid', 'unsold', 'defaulted'].includes(settlement.status)) return;
    try {
      await this.ledger.db.$transaction(
        async (tx) => {
          const row = await this.locked(tx, lotId);
          if (['paid', 'unsold', 'defaulted'].includes(row.status)) return;
          if (!row.winnerId || row.hammerKobo === null || !row.groupId)
            throw new ConflictException('Winner needs review.');
          const line = calculateInvoiceLine(fromLedgerKobo(row.hammerKobo));
          const intents = await tx.bidFundingIntent.findMany({
            where: {
              lotId,
              namespace: row.namespace,
              groupId: row.groupId,
              acceptance: { isNot: null },
            },
            orderBy: { id: 'asc' },
          });
          const first = intents[0];
          const snapshot = closingSnapshotSchema.parse(row.snapshot);
          if (
            !first ||
            !snapshot.leader ||
            intents.some(
              (i) =>
                i.userId !== row.winnerId ||
                i.walletId !== first.walletId ||
                i.feeVersion !== row.feeVersion,
            ) ||
            intents.reduce((n, i) => n + i.reservedKobo, 0n) !==
              BigInt(estimatedTotal(snapshot.leader.maxKobo))
          )
            throw new ConflictException('Winner funding needs review.');
          const invoice = await this.invoice(tx, row);
          if (row.status === 'payment_due') {
            if (!row.paymentDueAt) throw new ConflictException();
            // Match preparation's user/session/wallet lock order before a possible strike.
            await this.bids.lockEligibility(tx, row.winnerId);
            const holdIds = intents.flatMap((i) =>
              i.holdId ? [i.holdId] : [],
            );
            const funds = await this.ledger.fundsForHoldsInTransaction(
              tx,
              first.walletId,
              holdIds,
            );
            if (funds < BigInt(line.totalKobo)) {
              if (row.paymentDueAt.getTime() <= Date.now()) {
                await this.defaultWin(tx, row, first.walletId, intents);
                return;
              }
              throw new InsufficientFundsError(
                'Payment is awaiting wallet funds.',
              );
            }
            // An authorised win may use topped-up available funds after releasing its remaining holds.
            for (const i of intents)
              if (i.holdId)
                await this.ledger.releaseInTransaction(tx, {
                  walletId: first.walletId,
                  holdId: i.holdId,
                  idempotencyKey: `settlement:release:${i.id}`,
                  reference: `settlement:release:${i.id}`,
                });
            await this.ledger.debitInTransaction(tx, {
              walletId: first.walletId,
              amountKobo: BigInt(line.totalKobo),
              idempotencyKey: `settlement:debit:${lotId}`,
              reference: `settlement:debit:${lotId}`,
            });
          } else {
            await this.ledger.captureGroupInTransaction(tx, {
              walletId: first.walletId,
              holdIds: intents.flatMap((i) => (i.holdId ? [i.holdId] : [])),
              amountKobo: BigInt(line.totalKobo),
              idempotencyKey: `settlement:${lotId}`,
            });
          }
          const token = randomBytes(32).toString('base64url');
          const lot = await tx.lot.findUniqueOrThrow({ where: { id: lotId } });
          await tx.fulfilment.create({
            data: {
              invoiceId: invoice.id,
              userId: row.winnerId,
              locationId: lot.locationId,
              qrTokenHash: createHash('sha256').update(token).digest('hex'),
              qrTokenCiphertext: encryptPii(token, 'pickup-pass'),
            },
          });
          await tx.invoice.update({
            where: { id: invoice.id },
            data: { status: 'paid' },
          });
          await tx.lotSettlement.update({
            where: { lotId },
            data: { status: 'paid', invoiceId: invoice.id },
          });
          await tx.bidFundingIntent.updateMany({
            where: { id: { in: intents.map((i) => i.id) } },
            data: { status: 'released' },
          });
          await this.notify(tx, row, invoice.id, 'paid');
        },
        { maxWait: 60000, timeout: 15000 },
      );
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        await this.ledger.db.$transaction(async (tx) => {
          const row = await this.locked(tx, lotId);
          if (row.status !== 'frozen') return;
          const invoice = await this.invoice(tx, row);
          const deadline = new Date(Date.now() + PAYMENT_GRACE_MS);
          await tx.lotSettlement.update({
            where: { lotId },
            data: {
              status: 'payment_due',
              invoiceId: invoice.id,
              paymentDueAt: deadline,
            },
          });
          await this.notify(
            tx,
            { ...row, paymentDueAt: deadline },
            invoice.id,
            'payment_due',
          );
        });
        return;
      }
      // Preserve the frozen result and reservations; operators can see repeated system failures.
      await this.ledger.db.lotSettlement.updateMany({
        where: { lotId, status: { in: ['frozen', 'payment_due'] } },
        data: { lastErrorAt: new Date() },
      });
      throw error;
    }
  }
  private async relistUnsold(tx: Tx, lotId: string): Promise<string | null> {
    const old = await tx.lot.findUniqueOrThrow({
      where: { id: lotId },
      include: { images: true },
    });
    if (
      !old.autoRelistEnabled ||
      old.autoRelistCount >= unsoldRelistRules.maxRetries
    )
      return null;
    const startAt = new Date();
    const next = await tx.lot.create({
      data: {
        title: old.title,
        description: old.description,
        condition: old.condition,
        retailPriceKobo: old.retailPriceKobo,
        startPriceKobo: old.startPriceKobo,
        categoryId: old.categoryId,
        locationId: old.locationId,
        autoRelistEnabled: old.autoRelistEnabled,
        autoRelistCount: old.autoRelistCount + 1,
        isTopDeal: old.isTopDeal,
        topDealOrder: old.topDealOrder,
        status: 'open',
        startAt,
        endAt: new Date(startAt.getTime() + unsoldRelistRules.durationMs),
        images: {
          create: old.images.map(
            ({
              url,
              sortOrder,
              thumbnailUrl,
              width,
              height,
              thumbnailBytes,
            }) => ({
              url,
              sortOrder,
              thumbnailUrl,
              width,
              height,
              thumbnailBytes,
            }),
          ),
        },
      },
    });
    await tx.auditLog.create({
      data: {
        action: 'lots.unsold_auto_relisted',
        entityType: 'lot',
        entityId: lotId,
        afterCiphertext: encryptPii(
          JSON.stringify({
            relistLotId: next.id,
            retry: next.autoRelistCount,
            endAt: next.endAt,
          }),
          'audit',
        ),
      },
    });
    return next.id;
  }
  private async invoice(tx: Tx, row: LotSettlement) {
    if (row.invoiceId)
      return tx.invoice.findUniqueOrThrow({ where: { id: row.invoiceId } });
    if (!row.winnerId || row.hammerKobo === null) throw new ConflictException();
    const line = calculateInvoiceLine(fromLedgerKobo(row.hammerKobo));
    return tx.invoice.create({
      data: {
        userId: row.winnerId,
        hammerTotalKobo: BigInt(line.hammerKobo),
        premiumKobo: BigInt(line.premiumKobo),
        lotFeeKobo: BigInt(line.lotFeeKobo),
        vatKobo: BigInt(line.vatKobo),
        totalKobo: BigInt(line.totalKobo),
        lines: {
          create: {
            lotId: row.lotId,
            ...(Object.fromEntries(
              Object.entries(line).map(([k, v]) => [k, BigInt(v)]),
            ) as {
              hammerKobo: bigint;
              premiumKobo: bigint;
              lotFeeKobo: bigint;
              vatKobo: bigint;
              totalKobo: bigint;
            }),
          },
        },
      },
    });
  }
  private async defaultWin(
    tx: Tx,
    row: LotSettlement,
    walletId: string,
    intents: { id: string; holdId: string | null }[],
  ) {
    if (!row.winnerId || !row.invoiceId) throw new ConflictException();
    // Fence all capabilities before changing strike-based eligibility.
    await this.bids.fenceEligibility(tx, row.winnerId);
    for (const i of intents)
      if (i.holdId)
        await this.ledger.releaseInTransaction(tx, {
          walletId,
          holdId: i.holdId,
          idempotencyKey: `settlement:release:${i.id}`,
          reference: `settlement:release:${i.id}`,
        });
    const old = await tx.lot.findUniqueOrThrow({
      where: { id: row.lotId },
      include: { images: true },
    });
    const id = randomUUID();
    await tx.lot.create({
      data: {
        id,
        title: old.title,
        description: old.description,
        condition: old.condition,
        retailPriceKobo: old.retailPriceKobo,
        startPriceKobo: old.startPriceKobo,
        categoryId: old.categoryId,
        locationId: old.locationId,
        startAt: old.startAt,
        endAt: old.endAt,
        status: 'draft',
        autoRelistEnabled: old.autoRelistEnabled,
        autoRelistCount: old.autoRelistCount,
        images: {
          create: old.images.map((image) => ({
            url: image.url,
            sortOrder: image.sortOrder,
            thumbnailUrl: image.thumbnailUrl,
            width: image.width,
            height: image.height,
            thumbnailBytes: image.thumbnailBytes,
          })),
        },
      },
    });
    await tx.strike.create({
      data: {
        userId: row.winnerId,
        reference: `settlement:${row.lotId}`,
        reason: 'Winning invoice unpaid after 24 hours.',
      },
    });
    await tx.invoice.update({
      where: { id: row.invoiceId },
      data: { status: 'cancelled' },
    });
    await tx.bidFundingIntent.updateMany({
      where: { id: { in: intents.map((i) => i.id) } },
      data: { status: 'released' },
    });
    await tx.lotSettlement.update({
      where: { lotId: row.lotId },
      data: { status: 'defaulted', relistLotId: id },
    });
    await this.notify(tx, row, row.invoiceId, 'defaulted');
  }
  private async notify(
    tx: Tx,
    row: LotSettlement,
    invoiceId: string,
    status: 'paid' | 'payment_due' | 'defaulted',
  ) {
    if (!row.winnerId) throw new ConflictException();
    if (status !== 'payment_due')
      await tx.notification.updateMany({
        where: {
          reference: `settlement:${row.lotId}:payment_due`,
          status: 'pending',
        },
        data: { status: 'failed' },
      });
    const lot = await tx.lot.findUniqueOrThrow({
      where: { id: row.lotId },
      include: { location: true },
    });
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    const user = await tx.user.findUniqueOrThrow({
      where: { id: row.winnerId },
    });
    await tx.notification.create({
      data: {
        userId: row.winnerId,
        reference: `settlement:${row.lotId}:${status}`,
        channel: 'email',
        template: 'auction-result-v1',
        payloadCiphertext: encryptPii(
          JSON.stringify({
            emailCiphertext: user.emailCiphertext
              ? Buffer.from(user.emailCiphertext).toString('base64')
              : null,
            message: {
              invoiceNumber: invoice.number,
              title: lot.title,
              lotNumber: lot.lotNumber,
              hammerKobo: fromLedgerKobo(invoice.hammerTotalKobo),
              premiumKobo: fromLedgerKobo(invoice.premiumKobo),
              lotFeeKobo: fromLedgerKobo(invoice.lotFeeKobo),
              vatKobo: fromLedgerKobo(invoice.vatKobo),
              totalKobo: fromLedgerKobo(invoice.totalKobo),
              location: lot.location.name,
              address: lot.location.address,
              status,
              deadline: row.paymentDueAt?.toISOString() ?? null,
            },
          }),
          'notification',
        ),
      },
    });
  }
  async run() {
    await this.bids.persist([]);
    const pending = await this.ledger.db.lotSettlement.findMany({
      where: {
        namespace: this.bids.prefix,
        status: { in: ['frozen', 'payment_due'] },
        ...(this.pendingCursor ? { lotId: { gt: this.pendingCursor } } : {}),
      },
      orderBy: { lotId: 'asc' },
      take: 50,
      select: { lotId: true },
    });
    this.pendingCursor =
      pending.length === 50 ? pending.at(-1)?.lotId : undefined;
    const cursor = this.dueCursor;
    const due = await this.ledger.db.lot.findMany({
      where: {
        status: { in: ['open', 'closing'] },
        endAt: { lte: new Date() },
        ...(cursor
          ? {
              OR: [
                { endAt: { gt: cursor.endAt } },
                { endAt: cursor.endAt, id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ endAt: 'asc' }, { id: 'asc' }],
      take: 50,
      select: { id: true, endAt: true },
    });
    this.dueCursor = due.length === 50 ? due.at(-1) : undefined;
    const ids = [
      ...new Set([...pending.map((r) => r.lotId), ...due.map((r) => r.id)]),
    ];
    let failed = 0;
    for (const id of ids) {
      try {
        await this.closeLot(id);
      } catch {
        failed++;
      }
    }
    return { checked: ids.length, failed };
  }
  async pickupPass(userId: string, invoiceId: string) {
    const row = await this.ledger.db.fulfilment.findFirst({
      where: {
        invoiceId,
        userId,
        type: 'pickup',
        status: { in: ['pending', 'booked', 'ready'] },
        invoice: { status: 'paid' },
      },
    });
    if (!row?.qrTokenCiphertext)
      throw new NotFoundException('A paid pickup pass was not found.');
    return {
      invoiceId,
      fulfilmentId: row.id,
      token: decryptPii(Buffer.from(row.qrTokenCiphertext), 'pickup-pass'),
    };
  }
}
