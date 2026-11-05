import { requireStaffPermission } from '../auth/staff-access';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  calculateBidCancellationFee,
  formatNaira,
  effectiveAuctionFeeRules,
  fromLedgerKobo,
  bidCancellationApprovalSchema,
  bidCancellationQuoteSchema,
  bidCancellationApprovalResultSchema,
  CANCELLATION_REBID_MS,
  type BidCancellationApprovalInput,
} from '@auction-ng/shared';
import { LedgerService } from '../ledger/ledger-service';
import { InsufficientFundsError } from '../ledger/ledger-errors';
import type { AuthIdentity } from '../auth/auth-service';
import type {
  Prisma,
  BidCancellationApproval,
} from '../generated/prisma/client';
import { BidService } from './bid-service';
import { SupportService } from '../support/support-service';
import { bidRequestKey } from '../support/bid-request-key';
import { encryptPii, decryptPii } from '../security/pii';
import { paymentReturnUrl } from '../payments/payment-return-url';
const fencedSchema = z
  .object({
    status: z.literal('fenced'),
    id: z.uuid(),
    approvedAt: z.number().int().safe(),
    newEndAt: z.number().int().safe(),
    reopened: z.boolean(),
    barrierId: z.string(),
    lot: z
      .object({
        leader: z.object({
          bidderId: z.uuid(),
          maxKobo: z.number().int().safe(),
        }),
        groupId: z.uuid(),
        currentPriceKobo: z.number().int().safe(),
        startPriceKobo: z.number().int().safe(),
        endsAt: z.number().int().safe(),
        feeVersion: z.string(),
        bidRound: z.number().int().nonnegative().optional(),
      })
      .passthrough(),
  })
  .strict();
export class BidCancellationService {
  afterCommit?: () => Promise<void>;
  constructor(
    private readonly ledger: LedgerService,
    private readonly bids: BidService,
    private readonly support: SupportService,
  ) {}
  private async admin(
    identity: AuthIdentity,
    tx: Prisma.TransactionClient = this.ledger.db,
  ) {
    await requireStaffPermission(tx, identity.user.id, 'bids.cancel');
    const session = await tx.authSession.findFirst({
      where: {
        id: identity.sessionId,
        userId: identity.user.id,
        staffMfa: true,
        revokedAt: null,
        accessExpiresAt: { gt: new Date() },
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });
    if (
      !session ||
      session.user.status !== 'active' ||
      session.authenticatorVersion !== session.user.authenticatorVersion
    )
      throw new ForbiddenException();
  }
  private async context(conversationId: string) {
    const conversation = await this.ledger.db.supportConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation || conversation.buyerId !== conversation.createdById)
      throw new NotFoundException();
    const number = decryptPii(
      Buffer.from(conversation.referenceCiphertext),
      'support-text',
    );
    const lot = await this.ledger.db.lot.findUnique({
      where: { lotNumber: number },
    });
    if (!lot || conversation.createKey !== bidRequestKey(lot.id))
      throw new NotFoundException('This is not a bid cancellation request.');
    if (!conversation.bidCancellationFeeConsentAt)
      throw new ConflictException(
        'The buyer must confirm the cancellation fee in their request before approval.',
      );
    return { conversation, lot };
  }
  private result(row: BidCancellationApproval) {
    return bidCancellationApprovalResultSchema.parse({
      id: row.id,
      status: row.status,
      feeKobo: fromLedgerKobo(row.feeKobo),
      reopened: row.isLeader,
    });
  }
  async quote(identity: AuthIdentity, conversationId: string) {
    await this.admin(identity);
    await this.support.get(identity, conversationId);
    const { conversation, lot } = await this.context(conversationId);
    const existing = await this.ledger.db.bidCancellationApproval.findFirst({
      where: { conversationId, status: { not: 'failed' } },
      orderBy: { createdAt: 'desc' },
    });
    const book = existing?.snapshotCiphertext
      ? fencedSchema.parse(
          JSON.parse(
            decryptPii(
              Buffer.from(existing.snapshotCiphertext),
              'bid-cancellation',
            ),
          ),
        ).lot
      : await this.bids.cancellationBook(lot.id);
    const rules = effectiveAuctionFeeRules(
      await this.bids.fees.policy(book.feeVersion),
    );
    const price = book.currentPriceKobo ?? book.startPriceKobo;
    const buyer = await this.ledger.db.user.findUniqueOrThrow({
      where: { id: conversation.buyerId },
      select: { name: true },
    });
    return bidCancellationQuoteSchema.parse({
      conversationId,
      lotId: lot.id,
      lotNumber: lot.lotNumber,
      buyerName: buyer.name,
      priceKobo: price,
      premiumBps: rules.premiumBps,
      feeKobo:
        existing && existing.status !== 'pending'
          ? fromLedgerKobo(existing.feeKobo)
          : calculateBidCancellationFee(price, rules.premiumBps),
      streamId: ('streamId' in book ? book.streamId : undefined) ?? '0-0',
      isLeader:
        existing?.isLeader || book.leader?.bidderId === conversation.buyerId,
      status: existing
        ? existing.status === 'completed'
          ? 'completed'
          : 'processing'
        : 'available',
      endsAt: lot.endAt.toISOString(),
    });
  }
  async approve(
    identity: AuthIdentity,
    conversationId: string,
    input: BidCancellationApprovalInput,
  ) {
    const value = bidCancellationApprovalSchema.parse(input);
    await this.admin(identity);
    const { conversation, lot } = await this.context(conversationId);
    const hash = createHash('sha256')
      .update(JSON.stringify([conversationId, value]))
      .digest('hex');
    const op = await this.ledger.db.$transaction(async (tx) => {
      await this.admin(identity, tx);
      await tx.$queryRaw`SELECT id FROM support_conversations WHERE id=${conversationId}::uuid FOR UPDATE`;
      const previous = await tx.bidCancellationApproval.findUnique({
        where: {
          staffId_requestKey: {
            staffId: identity.user.id,
            requestKey: value.idempotencyKey,
          },
        },
      });
      if (previous) {
        if (previous.requestHash !== hash) throw new ConflictException();
        return previous;
      }
      const existing = await tx.bidCancellationApproval.findFirst({
        where: { conversationId, status: { not: 'failed' } },
      });
      if (existing) return existing;
      const own = await tx.bid.findFirst({
        where: { lotId: lot.id, userId: conversation.buyerId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { acceptance: { include: { intent: true } } },
      });
      if (!own || (own.acceptance?.intent.bidRound ?? 0) !== lot.bidRound)
        throw new ConflictException('No active bid remains to cancel.');
      const created = await tx.bidCancellationApproval.create({
        data: {
          conversationId,
          lotId: lot.id,
          buyerId: conversation.buyerId,
          staffId: identity.user.id,
          requestKey: value.idempotencyKey,
          requestHash: hash,
          namespace: this.bids.prefix,
          expectedStreamId: value.expectedStreamId,
          expectedFeeKobo: BigInt(value.expectedFeeKobo),
          reasonCiphertext: encryptPii(value.reason, 'bid-cancellation'),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: identity.user.id,
          action: 'bid.cancellation_approved',
          entityType: 'lot',
          entityId: lot.id,
          afterCiphertext: encryptPii(
            JSON.stringify({
              approvalId: created.id,
              conversationId,
              buyerId: created.buyerId,
              reason: value.reason,
            }),
            'audit',
          ),
        },
      });
      return created;
    });
    await this.resume(op.id);
    return this.result(
      await this.ledger.db.bidCancellationApproval.findUniqueOrThrow({
        where: { id: op.id },
      }),
    );
  }
  private async resume(id: string) {
    let op = await this.ledger.db.bidCancellationApproval.findUniqueOrThrow({
      where: { id },
    });
    if (
      op.namespace !== this.bids.prefix ||
      ['completed', 'failed'].includes(op.status)
    )
      return;
    if (op.status === 'pending') {
      const raw = await this.bids.cancellationGate(
        op.lotId,
        'begin',
        id,
        op.buyerId,
        op.expectedStreamId,
      );
      const parsed = fencedSchema.safeParse(raw);
      if (!parsed.success) {
        const status = z
          .object({ status: z.string() })
          .passthrough()
          .parse(raw).status;
        if (status === 'stale')
          await this.ledger.db.bidCancellationApproval.updateMany({
            where: { id, status: 'pending' },
            data: { status: 'failed' },
          });
        else
          throw new ServiceUnavailableException(
            'Cancellation is waiting for the auction engine. Retry the same approval.',
          );
        return;
      }
      const snapshot = parsed.data;
      await this.bids.persistThrough(snapshot.barrierId);
      const rules = effectiveAuctionFeeRules(
        await this.bids.fees.policy(snapshot.lot.feeVersion),
      );
      const fee = calculateBidCancellationFee(
        snapshot.lot.currentPriceKobo,
        rules.premiumBps,
      );
      try {
        await this.ledger.db.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM bid_cancellation_approvals WHERE id=${id}::uuid FOR UPDATE`;
            const current = await tx.bidCancellationApproval.findUniqueOrThrow({
              where: { id },
            });
            if (current.status !== 'pending') return;
            if (BigInt(fee) !== current.expectedFeeKobo)
              throw new BadRequestException('The fee quote changed.');
            await tx.$queryRaw`SELECT id FROM lots WHERE id=${op.lotId}::uuid FOR UPDATE`;
            const lot = await tx.lot.findUniqueOrThrow({
              where: { id: op.lotId },
            });
            if (
              lot.status !== 'open' ||
              lot.bidRound !== (snapshot.lot.bidRound ?? 0)
            )
              throw new BadRequestException('Auction state changed.');
            const wallet = await tx.wallet.findUniqueOrThrow({
              where: { userId: op.buyerId },
            });
            const intents = snapshot.reopened
              ? await tx.bidFundingIntent.findMany({
                  where: {
                    groupId: snapshot.lot.groupId,
                    userId: op.buyerId,
                    hold: { status: 'active' },
                  },
                  select: { id: true, holdId: true },
                })
              : [];
            const ids = intents.flatMap((row) =>
              row.holdId ? [row.holdId] : [],
            );
            if (snapshot.reopened && !ids.length)
              throw new ConflictException(
                'The winning reservation needs review.',
              );
            await this.ledger.cancelBidInTransaction(tx, {
              walletId: wallet.id,
              holdIds: ids,
              feeKobo: BigInt(fee),
              key: 'bid-cancel:' + id,
            });
            await tx.bidFundingIntent.updateMany({
              where: { id: { in: intents.map((row) => row.id) } },
              data: { status: 'released' },
            });
            if (snapshot.reopened)
              await tx.lot.update({
                where: { id: op.lotId },
                data: {
                  bidRound: { increment: 1 },
                  endAt: new Date(
                    Math.max(
                      snapshot.newEndAt,
                      Date.now() + CANCELLATION_REBID_MS,
                    ),
                  ),
                },
              });
            await tx.bidCancellationApproval.update({
              where: { id },
              data: {
                status: 'committed',
                feeKobo: BigInt(fee),
                priceKobo: BigInt(snapshot.lot.currentPriceKobo),
                premiumBps: rules.premiumBps,
                isLeader: snapshot.reopened,
                snapshotCiphertext: encryptPii(
                  JSON.stringify(snapshot),
                  'bid-cancellation',
                ),
              },
            });
            await tx.auditLog.create({
              data: {
                actorId: op.staffId,
                action: 'bid.cancellation_charged',
                entityType: 'lot',
                entityId: op.lotId,
                beforeCiphertext: encryptPii(
                  JSON.stringify({
                    priceKobo: snapshot.lot.currentPriceKobo,
                    leaderId: snapshot.lot.leader.bidderId,
                    endsAt: snapshot.lot.endsAt,
                  }),
                  'audit',
                ),
                afterCiphertext: encryptPii(
                  JSON.stringify({
                    approvalId: id,
                    feeKobo: fee,
                    premiumBps: rules.premiumBps,
                    reopened: snapshot.reopened,
                  }),
                  'audit',
                ),
              },
            });
          },
          { maxWait: 60000, timeout: 15000 },
        );
      } catch (failure) {
        if (
          failure instanceof InsufficientFundsError ||
          failure instanceof BadRequestException
        ) {
          await this.ledger.db.bidCancellationApproval.updateMany({
            where: { id, status: 'pending' },
            data: { status: 'failed' },
          });
          await this.bids.cancellationGate(op.lotId, 'abort', id, op.buyerId);
          return;
        }
        throw failure;
      }
      await this.afterCommit?.();
      op = await this.ledger.db.bidCancellationApproval.findUniqueOrThrow({
        where: { id },
      });
    }
    if (op.status === 'committed') {
      const result = z
        .object({
          status: z.literal('completed'),
          endsAt: z.number().int().safe().optional(),
        })
        .strict()
        .safeParse(
          await this.bids.cancellationGate(op.lotId, 'commit', id, op.buyerId),
        );
      if (!result.success)
        throw new ServiceUnavailableException(
          'Cancellation is committed and will finish safely.',
        );
      await this.ledger.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM bid_cancellation_approvals WHERE id=${id}::uuid FOR UPDATE`;
        const current = await tx.bidCancellationApproval.findUniqueOrThrow({
          where: { id },
        });
        if (current.status === 'completed') return;
        if (op.isLeader && result.data.endsAt)
          await tx.lot.updateMany({
            where: {
              id: op.lotId,
              endAt: { lt: new Date(result.data.endsAt) },
            },
            data: { endAt: new Date(result.data.endsAt) },
          });
        await tx.bidCancellationApproval.update({
          where: { id },
          data: { status: 'completed' },
        });
        await tx.supportConversation.update({
          where: { id: op.conversationId },
          data: {
            status: 'resolved',
            version: { increment: 1 },
            updatedAt: new Date(),
          },
        });
        const sequence = await tx.supportMessage.aggregate({
          where: { conversationId: op.conversationId },
          _max: { sequence: true },
        });
        await tx.supportMessage.create({
          data: {
            conversationId: op.conversationId,
            authorId: op.staffId,
            kind: 'staff',
            sequence: (sequence._max.sequence ?? -1) + 1,
            bodyCiphertext: encryptPii(
              `Staff completed your bid cancellation. Cancellation fee: ${formatNaira(fromLedgerKobo(op.feeKobo))} (${op.premiumBps / 100}% of the public bid price at approval). Remaining reserved funds were released. You cannot bid again on this item.`,
              'support-text',
            ),
            requestKey: id,
            requestHash: op.requestHash,
          },
        });
        await this.enqueue(tx, op, op.buyerId, 'cancelled');
      });
    }
  }
  private async enqueue(
    tx: Prisma.TransactionClient,
    op: BidCancellationApproval,
    userId: string,
    kind: 'cancelled' | 'reopened',
  ) {
    const [user, lot] = await Promise.all([
      tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { emailCiphertext: true },
      }),
      tx.lot.findUniqueOrThrow({
        where: { id: op.lotId },
        select: { title: true, lotNumber: true, endAt: true },
      }),
    ]);
    await tx.notification.createMany({
      data: [
        {
          userId,
          reference: `${kind === 'reopened' ? 'rebid' : 'bid-cancel'}:${op.lotId}:${op.id}:${userId}`,
          channel: 'email',
          template: 'bid-cancellation-v1',
          payloadCiphertext: encryptPii(
            JSON.stringify({
              emailCiphertext: user.emailCiphertext
                ? Buffer.from(user.emailCiphertext).toString('base64')
                : null,
              message: {
                kind,
                title: lot.title,
                lotNumber: lot.lotNumber,
                feeKobo: fromLedgerKobo(op.feeKobo),
                premiumBps: op.premiumBps,
                endsAt: lot.endAt.toISOString(),
                itemUrl: new URL(
                  '/lots/' + op.lotId,
                  paymentReturnUrl('purchase', op.lotId),
                ).href,
              },
            }),
            'notification',
          ),
        },
      ],
      skipDuplicates: true,
    });
  }
  async maintain() {
    const failed = await this.ledger.db.bidCancellationApproval.findMany({
      where: {
        namespace: this.bids.prefix,
        status: 'failed',
        noticesComplete: false,
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: 50,
    });
    for (const row of failed) {
      await this.bids.cancellationGate(row.lotId, 'abort', row.id, row.buyerId);
      await this.ledger.db.bidCancellationApproval.update({
        where: { id: row.id },
        data: { noticesComplete: true },
      });
    }
    const pending = await this.ledger.db.bidCancellationApproval.findMany({
      where: {
        namespace: this.bids.prefix,
        status: { in: ['pending', 'committed'] },
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: 50,
    });
    for (const row of pending)
      try {
        await this.resume(row.id);
      } catch {
        /* Keep the durable fence; retry without double charging. */
      }
    const rows = await this.ledger.db.bidCancellationApproval.findMany({
      where: {
        namespace: this.bids.prefix,
        status: 'completed',
        noticesComplete: false,
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: 10,
    });
    for (const row of rows)
      await this.ledger.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM bid_cancellation_approvals WHERE id=${row.id}::uuid FOR UPDATE`;
        const op = await tx.bidCancellationApproval.findUniqueOrThrow({
          where: { id: row.id },
        });
        if (op.noticesComplete) return;
        if (!op.isLeader) {
          await tx.bidCancellationApproval.update({
            where: { id: op.id },
            data: { noticesComplete: true },
          });
          return;
        }
        const snapshot = fencedSchema.parse(
          JSON.parse(
            decryptPii(
              Buffer.from(op.snapshotCiphertext ?? []),
              'bid-cancellation',
            ),
          ),
        );
        const at = new Date(snapshot.approvedAt);
        const recipients = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM (SELECT user_id AS id FROM bids WHERE lot_id=${op.lotId}::uuid AND created_at<=${at} UNION SELECT user_id AS id FROM watchlist WHERE lot_id=${op.lotId}::uuid AND created_at<=${at}) AS recipients WHERE id<>${op.buyerId}::uuid AND (${op.noticeCursor}::uuid IS NULL OR id>${op.noticeCursor}::uuid) AND NOT EXISTS (SELECT 1 FROM bid_cancellation_approvals c WHERE c.lot_id=${op.lotId}::uuid AND c.buyer_id=recipients.id AND c.status IN ('committed','completed')) ORDER BY id LIMIT 50`;
        for (const recipient of recipients)
          await this.enqueue(tx, op, recipient.id, 'reopened');
        await tx.bidCancellationApproval.update({
          where: { id: op.id },
          data: {
            noticeCursor: recipients.at(-1)?.id ?? op.noticeCursor,
            noticesComplete: recipients.length < 50,
          },
        });
      });
  }
}
