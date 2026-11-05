import { requireStaffPermission } from '../auth/staff-access';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  canChangePreBid,
  effectiveAuctionFeeRules,
  estimatedTotal,
  fromLedgerKobo,
  isBuyerEligible,
  PREBID_BATCH_SIZE,
  preBidResponseSchema,
  preBidChangeSchema,
  preBidCancelSchema,
  preBidScheduleSchema,
  type PreBidChange,
  type PreBidCancel,
  type PreBidSchedule,
} from '@auction-ng/shared';
import type { Prisma, PreBid, Lot } from '../generated/prisma/client';
import { LedgerService } from '../ledger/ledger-service';
import { BidService } from '../bids/bid-service';
import type { AuthIdentity } from '../auth/auth-service';
import { encryptPii, decryptPii, hashPii } from '../security/pii';
type Tx = Prisma.TransactionClient;
type Identity = { userId: string; sessionId: string };
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class PreBidService {
  private launchCursor: { startAt: Date; id: string } | undefined;
  afterActivation?: () => Promise<void>;
  constructor(
    private readonly ledger: LedgerService,
    private readonly bids: BidService,
  ) {}
  private async identity(tx: Tx, who: Identity, admin = false) {
    if (admin) await requireStaffPermission(tx, who.userId, 'auctions.manage');
    await tx.$queryRaw`SELECT id FROM users WHERE id=${who.userId}::uuid FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({
      where: { id: who.userId },
      include: { strikes: { where: { revokedAt: null }, take: 3 } },
    });
    const session = await tx.authSession.findFirst({
      where: {
        id: who.sessionId,
        userId: who.userId,
        revokedAt: null,
        accessExpiresAt: { gt: new Date() },
        expiresAt: { gt: new Date() },
        authenticatorVersion: user.authenticatorVersion,
        ...(admin ? { staffMfa: true } : { buyerMfa: true }),
      },
    });
    if (
      !session ||
      user.status !== 'active' ||
      (admin
        ? !user.authenticatorEnabled
        : !isBuyerEligible({
            role: user.role,
            status: user.status,
            emailVerified: user.emailVerifiedAt !== null,
          }) || user.strikes.length >= 3)
    )
      throw new ForbiddenException(
        'Sign in with an eligible account before continuing.',
      );
    return { user, session };
  }
  private async lockedLot(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM lots WHERE id=${id}::uuid FOR UPDATE`;
    const lot = await tx.lot.findUnique({ where: { id } });
    if (!lot) throw new NotFoundException();
    return lot;
  }
  private dto(row: PreBid | null, lot: Lot) {
    return preBidResponseSchema.parse({
      preBid: row
        ? {
            id: row.id,
            lotId: row.lotId,
            maxKobo: fromLedgerKobo(row.maxKobo),
            totalKobo: fromLedgerKobo(row.totalKobo),
            feeVersion: row.feeVersion,
            revision: row.revision,
            status: row.status,
            startsAt: lot.startAt.toISOString(),
            serverTime: new Date().toISOString(),
          }
        : null,
      serverTime: new Date().toISOString(),
    });
  }
  private async replay(
    tx: Tx,
    scope: string,
    userId: string,
    key: string,
    request: unknown,
  ) {
    const record = await tx.idempotencyKey.findUnique({
      where: { scope_key: { scope, key: userId + ':' + key } },
    });
    if (!record) return;
    if (record.requestHash !== hash(request) || !record.responseCiphertext)
      throw new ConflictException(
        'This request key belongs to another operation.',
      );
    return JSON.parse(
      decryptPii(Buffer.from(record.responseCiphertext), 'prebid-command'),
    ) as unknown;
  }
  private async remember(
    tx: Tx,
    scope: string,
    userId: string,
    key: string,
    request: unknown,
    response: unknown,
  ) {
    await tx.idempotencyKey.create({
      data: {
        scope,
        key: userId + ':' + key,
        userId,
        requestHash: hash(request),
        status: 'completed',
        responseCiphertext: encryptPii(
          JSON.stringify(response),
          'prebid-command',
        ),
      },
    });
  }
  async read(who: Identity, lotId: string) {
    return this.ledger.db.$transaction(async (tx) => {
      await this.identity(tx, who);
      const lot = await tx.lot.findUnique({ where: { id: lotId } });
      if (!lot || lot.status === 'draft')
        throw new NotFoundException('This auction is not available.');
      return this.dto(
        await tx.preBid.findUnique({
          where: { lotId_userId: { lotId, userId: who.userId } },
        }),
        lot,
      );
    });
  }
  async change(who: Identity, lotId: string, input: PreBidChange) {
    this.bids.assertPreBidAvailable();
    const value = preBidChangeSchema.parse(input),
      request = { lotId, ...value };
    return this.ledger.db.$transaction(
      async (tx) => {
        await this.identity(tx, who);
        const prior = await this.replay(
          tx,
          'prebid-change',
          who.userId,
          value.idempotencyKey,
          request,
        );
        if (prior) return preBidResponseSchema.parse(prior);
        const lot = await this.lockedLot(tx, lotId);
        if (
          !canChangePreBid(
            lot.status,
            Date.now(),
            lot.startAt.getTime(),
            lot.preBidsLaunching,
          )
        )
          throw new ConflictException(
            'Pre-bids can only be changed before launch.',
          );
        const existing = await tx.preBid.findUnique({
          where: { lotId_userId: { lotId, userId: who.userId } },
        });
        if (
          (existing?.revision ?? 0) !== value.expectedRevision ||
          existing?.intentId
        )
          throw new ConflictException(
            'Your pre-bid changed. Reload before continuing.',
          );
        if (value.maxKobo < fromLedgerKobo(lot.startPriceKobo))
          throw new BadRequestException(
            'Your limit must cover the starting price.',
          );
        // Serialize first pre-bid fee locking against admin policy commits. A
        // committed policy with pending Redis activation cannot be quoted here.
        await tx.$queryRaw`SELECT id FROM auction_fee_controls WHERE id=1 FOR SHARE`;
        const controls = await tx.auctionFeeControls.findUniqueOrThrow({
          where: { id: 1 },
        });
        const policy = await this.bids.fees.policy(
          lot.auctionFeeVersion ?? controls.currentVersion,
        );
        if (
          !lot.auctionFeeVersion &&
          (await this.bids.fees.active()).version !== controls.currentVersion
        )
          throw new ConflictException(
            'Fee activation is pending. Refresh before pre-bidding.',
          );
        if (value.feeVersion !== policy.version)
          throw new ConflictException(
            'Auction fees changed. Review the current total.',
          );
        const total = estimatedTotal(
          value.maxKobo,
          effectiveAuctionFeeRules(policy),
        );
        const wallet = await tx.wallet.findUnique({
          where: { userId: who.userId },
        });
        if (!wallet)
          throw new BadRequestException(
            'Add funds to your wallet before pre-bidding.',
          );
        if (existing?.status === 'active')
          await this.ledger.releaseInTransaction(tx, {
            walletId: wallet.id,
            holdId: existing.holdId,
            idempotencyKey: `prebid:replace:${existing.id}:${existing.revision}`,
            reference: `prebid:replace:${existing.id}:${existing.revision}`,
          });
        const holdId = randomUUID();
        await this.ledger.holdInTransaction(tx, {
          walletId: wallet.id,
          holdId,
          amountKobo: BigInt(total),
          idempotencyKey: `prebid:hold:${who.userId}:${value.idempotencyKey}`,
          reference: `prebid:hold:${who.userId}:${value.idempotencyKey}`,
        });
        const priority = await tx.$queryRaw<
          { value: bigint }[]
        >`SELECT nextval('pre_bids_priority_seq') AS value`;
        const fields = {
          sessionId: who.sessionId,
          holdId,
          maxKobo: BigInt(value.maxKobo),
          totalKobo: BigInt(total),
          feeVersion: policy.version,
          scheduleVersion: lot.scheduleVersion,
          status: 'active',
          priority: priority[0]?.value,
          updatedAt: new Date(),
        };
        if (!lot.auctionFeeVersion)
          await tx.lot.update({
            where: { id: lotId },
            data: { auctionFeeVersion: policy.version },
          });
        const row = existing
          ? await tx.preBid.update({
              where: { id: existing.id },
              data: { ...fields, revision: { increment: 1 } },
            })
          : await tx.preBid.create({
              data: {
                ...fields,
                lotId,
                userId: who.userId,
                walletId: wallet.id,
              },
            });

        const result = this.dto(row, lot);
        await this.remember(
          tx,
          'prebid-change',
          who.userId,
          value.idempotencyKey,
          request,
          result,
        );
        return result;
      },
      { maxWait: 15000, timeout: 15000 },
    );
  }
  async cancel(who: Identity, lotId: string, input: PreBidCancel) {
    const value = preBidCancelSchema.parse(input),
      request = { lotId, ...value };
    return this.ledger.db.$transaction(async (tx) => {
      await this.identity(tx, who);
      const prior = await this.replay(
        tx,
        'prebid-cancel',
        who.userId,
        value.idempotencyKey,
        request,
      );
      if (prior) return preBidResponseSchema.parse(prior);
      const lot = await this.lockedLot(tx, lotId);
      if (
        !canChangePreBid(
          lot.status,
          Date.now(),
          lot.startAt.getTime(),
          lot.preBidsLaunching,
        )
      )
        throw new ConflictException(
          'Pre-bids can only be cancelled before launch.',
        );
      const row = await tx.preBid.findUnique({
        where: { lotId_userId: { lotId, userId: who.userId } },
      });
      if (
        !row ||
        row.status !== 'active' ||
        row.revision !== value.expectedRevision
      )
        throw new ConflictException('Reload your pre-bid before cancelling.');
      await this.release(tx, row, 'cancelled');
      const updated = await tx.preBid.findUniqueOrThrow({
        where: { id: row.id },
      });
      const result = this.dto(updated, lot);
      await this.remember(
        tx,
        'prebid-cancel',
        who.userId,
        value.idempotencyKey,
        request,
        result,
      );
      return result;
    });
  }
  private async release(
    tx: Tx,
    row: PreBid,
    status: 'cancelled' | 'expired' | 'outbid',
  ) {
    await this.ledger.releaseInTransaction(tx, {
      walletId: row.walletId,
      holdId: row.holdId,
      idempotencyKey: `prebid:release:${row.id}:${row.revision}`,
      reference: `prebid:release:${row.id}:${row.revision}`,
    });
    await tx.preBid.update({
      where: { id: row.id },
      data: { status, revision: { increment: 1 }, updatedAt: new Date() },
    });
  }
  private async notice(tx: Tx, row: PreBid, lot: Lot, reason: string) {
    const user = await tx.user.findUniqueOrThrow({ where: { id: row.userId } });
    await tx.notification.upsert({
      where: { reference: `prebid:${lot.id}:${row.id}:${row.revision}` },
      create: {
        userId: row.userId,
        reference: `prebid:${lot.id}:${row.id}:${row.revision}`,
        channel: 'email',
        template: 'prebid-v1',
        status: 'pending',
        payloadCiphertext: encryptPii(
          JSON.stringify({
            emailCiphertext: user.emailCiphertext
              ? Buffer.from(user.emailCiphertext).toString('base64')
              : null,
            message: {
              lotNumber: lot.lotNumber,
              title: lot.title,
              reason,
              releasedKobo: fromLedgerKobo(row.totalKobo),
            },
          }),
          'notification',
        ),
      },
      update: {},
    });
  }
  async schedule(identity: AuthIdentity, lotId: string, input: PreBidSchedule) {
    const value = preBidScheduleSchema.parse(input),
      who = { userId: identity.user.id, sessionId: identity.sessionId },
      request = { lotId, ...value };
    const result = await this.ledger.db.$transaction(async (tx) => {
      await this.identity(tx, who, true);
      const prior = await this.replay(
        tx,
        'prebid-schedule',
        who.userId,
        value.idempotencyKey,
        request,
      );
      if (prior) return prior;
      const lot = await this.lockedLot(tx, lotId);
      if (
        lot.archivedAt ||
        !['draft', 'scheduled'].includes(lot.status) ||
        lot.preBidsLaunching
      )
        throw new ConflictException(
          'Only an unlaunched scheduled auction can be changed.',
        );
      if (lot.updatedAt.toISOString() !== value.expectedUpdatedAt)
        throw new ConflictException('This auction changed. Reload it first.');
      if (
        value.action === 'schedule' &&
        (!value.startsAt ||
          !value.endsAt ||
          Date.parse(value.startsAt) <= Date.now())
      )
        throw new BadRequestException(
          'Choose a future launch time and a later closing time.',
        );
      if (
        value.action === 'schedule' &&
        !(await tx.lotImage.count({ where: { lotId } }))
      )
        throw new BadRequestException(
          'Add an item photo before scheduling this auction.',
        );
      const row = await tx.lot.update({
        where: { id: lotId },
        data: {
          status: value.action === 'cancel' ? 'cancelled' : 'scheduled',
          ...(value.action === 'schedule'
            ? {
                startAt: new Date(value.startsAt ?? ''),
                endAt: new Date(value.endsAt ?? ''),
              }
            : {}),
          scheduleVersion: { increment: 1 },
          updatedAt: new Date(
            Math.max(Date.now(), lot.updatedAt.getTime() + 1),
          ),
        },
      });
      const response = {
        lotId,
        status: row.status,
        startsAt: row.startAt.toISOString(),
        endsAt: row.endAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
      await tx.auditLog.create({
        data: {
          actorId: who.userId,
          action:
            value.action === 'cancel'
              ? 'lots.upcoming_cancelled'
              : 'lots.scheduled',
          entityType: 'lot',
          entityId: lotId,
          beforeCiphertext: encryptPii(
            JSON.stringify({
              status: lot.status,
              startsAt: lot.startAt.toISOString(),
              endsAt: lot.endAt.toISOString(),
            }),
            'audit',
          ),
          afterCiphertext: encryptPii(
            JSON.stringify({ ...response, reason: value.reason }),
            'audit',
          ),
        },
      });
      await this.remember(
        tx,
        'prebid-schedule',
        who.userId,
        value.idempotencyKey,
        request,
        response,
      );
      return response;
    });
    await this.releaseInvalidated(lotId);
    return result;
  }
  private async releaseInvalidated(lotId?: string) {
    const rows = await this.ledger.db.$queryRaw<
      { id: string }[]
    >`SELECT p.id FROM pre_bids p JOIN lots l ON l.id=p.lot_id WHERE p.status='active' AND (${lotId ?? null}::uuid IS NULL OR p.lot_id=${lotId ?? null}::uuid) AND (l.status='cancelled' OR l.schedule_version<>p.schedule_version) ORDER BY p.updated_at,p.id LIMIT ${PREBID_BATCH_SIZE}`;
    for (const { id } of rows)
      await this.ledger.db.$transaction(async (tx) => {
        const before = await tx.preBid.findUniqueOrThrow({ where: { id } });
        const lot = await this.lockedLot(tx, before.lotId);
        const row = await tx.preBid.findUniqueOrThrow({ where: { id } });
        if (
          row.status !== 'active' ||
          (lot.status !== 'cancelled' &&
            row.scheduleVersion === lot.scheduleVersion)
        )
          return;
        await this.release(tx, row, 'cancelled');
        await this.notice(
          tx,
          row,
          lot,
          lot.status === 'cancelled'
            ? 'The upcoming auction was cancelled. Your reserved funds have been released.'
            : 'The launch time changed. Your reserved funds have been released. Review the new schedule before placing another pre-bid.',
        );
      });
  }
  async maintain() {
    await this.releaseInvalidated();
    const query = () =>
      this.ledger.db.lot.findMany({
        where: {
          status: 'scheduled',
          startAt: { lte: new Date() },
          ...(this.launchCursor
            ? {
                OR: [
                  { startAt: { gt: this.launchCursor.startAt } },
                  {
                    startAt: this.launchCursor.startAt,
                    id: { gt: this.launchCursor.id },
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ startAt: 'asc' as const }, { id: 'asc' as const }],
        take: PREBID_BATCH_SIZE,
      });
    let lots = await query();
    if (!lots.length && this.launchCursor) {
      this.launchCursor = undefined;
      lots = await query();
    }
    let failure: unknown;
    for (const item of lots) {
      this.launchCursor = { startAt: item.startAt, id: item.id };
      try {
        const claimed = await this.ledger.db.$transaction(async (tx) => {
          const row = await this.lockedLot(tx, item.id);
          if (row.status !== 'scheduled' || row.startAt.getTime() > Date.now())
            return false;
          await tx.lot.update({
            where: { id: row.id },
            data: { preBidsLaunching: true },
          });
          return true;
        });
        if (!claimed) continue;
        await this.bids.beginScheduledLaunch(item.id);
        const pending = await this.ledger.db.preBid.findMany({
          where: {
            lotId: item.id,
            status: { in: ['active', 'launching'] },
            scheduleVersion: item.scheduleVersion,
          },
          orderBy: [{ priority: 'asc' }, { id: 'asc' }],
          take: PREBID_BATCH_SIZE,
        });
        for (const pre of pending) await this.activate(pre.id);
        if (
          !(await this.ledger.db.preBid.count({
            where: { lotId: item.id, status: { in: ['active', 'launching'] } },
          }))
        ) {
          await this.bids.finishScheduledLaunch(item.id);
          await this.ledger.db.lot.updateMany({
            where: { id: item.id, status: 'scheduled', preBidsLaunching: true },
            data: { status: 'open', preBidsLaunching: false },
          });
        }
      } catch (error) {
        failure ??= error;
      }
    }
    if (failure) throw failure;
    return { checked: lots.length };
  }
  private async activate(id: string) {
    let intentId: string | undefined;
    await this.ledger.db.$transaction(async (tx) => {
      const initial = await tx.preBid.findUniqueOrThrow({ where: { id } });
      await this.bids.lockEligibility(tx, initial.userId);
      const lot = await this.lockedLot(tx, initial.lotId);
      const row = await tx.preBid.findUniqueOrThrow({ where: { id } });
      if (!['active', 'launching'].includes(row.status)) return;
      if (
        lot.status !== 'scheduled' ||
        !lot.preBidsLaunching ||
        lot.scheduleVersion !== row.scheduleVersion
      )
        throw new ConflictException('Launch state changed.');
      const user = await tx.user.findUniqueOrThrow({
        where: { id: row.userId },
        include: { strikes: { where: { revokedAt: null }, take: 3 } },
      });
      // An already accepted proof must reconcile even if eligibility changed
      // after acceptance; never release a potentially winning reservation.
      if (
        !row.intentId &&
        (!isBuyerEligible({
          role: user.role,
          status: user.status,
          emailVerified: user.emailVerifiedAt !== null,
        }) ||
          user.strikes.length >= 3 ||
          lot.endAt.getTime() <= Date.now())
      ) {
        await this.release(tx, row, 'expired');
        await this.notice(
          tx,
          row,
          lot,
          'Your pre-bid could not activate. Its reserved funds have been released.',
        );
        return;
      }
      if (!row.intentId) {
        await tx.bidFundingIntent.create({
          data: {
            id: row.id,
            isPreBid: true,
            userId: row.userId,
            sessionId: row.sessionId,
            walletId: row.walletId,
            lotId: row.lotId,
            holdId: row.holdId,
            groupId: row.id,
            requestKey: row.id,
            requestHash: hash(['prebid', row.id, row.revision]),
            binding: hashPii(row.id, 'prebid-launch'),
            namespace: this.bids.prefix,
            maxKobo: row.maxKobo,
            mode: 'automatic',
            totalKobo: row.totalKobo,
            reservedKobo: row.totalKobo,
            feeVersion: row.feeVersion,
            expiresAt: lot.endAt,
          },
        });
        await tx.preBid.update({
          where: { id },
          data: { status: 'launching', intentId: row.id },
        });
      }
      intentId = row.id;
    });
    if (!intentId) return;
    const accepted = await this.ledger.db.$transaction(
      async (tx) => {
        const row = await tx.preBid.findUniqueOrThrow({ where: { id } });
        await this.bids.lockEligibility(tx, row.userId);
        const result = await this.bids.activateScheduledPreBid(
          intentId ?? '',
          tx,
        );
        await this.afterActivation?.();
        await tx.preBid.update({
          where: { id },
          data: {
            status: result.status === 'accepted' ? 'accepted' : 'outbid',
          },
        });
        if (result.status !== 'accepted') {
          const lot = await tx.lot.findUniqueOrThrow({
            where: { id: row.lotId },
          });
          await this.notice(
            tx,
            row,
            lot,
            'Your pre-bid could not lead when the auction launched. Its reserved funds have been released. Open the live auction to review the current price.',
          );
        }
        return result;
      },
      { maxWait: 15000, timeout: 15000 },
    );
    // Persistence takes FK locks on users. Run it after releasing the
    // eligibility transaction; the durable stream handles a crash here.
    if (accepted.streamId) await this.bids.persist([accepted.streamId]);
  }
}
