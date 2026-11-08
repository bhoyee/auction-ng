import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createClient } from 'redis';
import { z } from 'zod';
import {
  isBuyerEligible,
  BID_FEE_VERSION,
  BID_STREAM_NAMESPACE,
  liveLotSchema,
  publicBrowseStateSchema,
  closingSnapshotSchema,
  compareStreamIds,
  BID_PREPARATION_MS,
  BID_PREPARE_LIMIT,
  bidPreparationSchema,
  bidResultSchema,
  prepareBidSchema,
  confirmBidSchema,
  estimatedTotal,
  effectiveAuctionFeeRules,
  fromLedgerKobo,
  minNextBid,
  auctionControlPrefix,
  auctionPauseStateSchema,
  type PrepareBidInput,
  type ConfirmBidInput,
  type AuctionState,
} from '@auction-ng/shared';
import { LedgerService } from '../ledger/ledger-service';
import type { BidFundingIntent, Prisma } from '../generated/prisma/client';
import { BID_LUA } from './bid-lua';
import { CANCELLATION_LUA } from './cancellation-lua';
import { AuctionFeeService } from './auction-fee-service';
import { CLOSE_LUA } from '../closing/close-lua';
import { PURCHASE_LUA } from '../purchases/purchase-lua';
import { persistAcceptedBids } from './bid-persistence';
import { monitorBook } from '../staff-admin/live-book';
import { AUCTION_PAUSE_LUA, AUCTION_RESUME_LOT_LUA } from './auction-pause-lua';
import { InsufficientFundsError } from '../ledger/ledger-errors';
import { LiveIssues } from '../staff-admin/live-issues';

type BidIdentity = { userId: string; sessionId: string };
type LiveLot = AuctionState & {
  startsAt?: number;
  open: boolean;
  groupId: string | null;
  feeVersion: string;
  feeLocked?: boolean;
  bidRound?: number;
};
type EngineResult = {
  status: string;
  mode?: string;
  reason?: string;
  result?: EngineResult;
  isLeader?: boolean;
  state?: AuctionState;
  serverTime?: number;
  streamId?: string;
};
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');

export class BidService {
  readonly fees: AuctionFeeService;
  readonly prefix: string;
  private readonly redis;
  private readonly issues: LiveIssues;
  private ready = false;
  private started = false;
  private scriptSha: string | undefined;
  private cursor: string | undefined;
  private warmCursor: { endAt: Date; id: string } | undefined;
  readonly enabled: boolean;
  private readonly preparationMs: number;
  constructor(
    private readonly ledger: LedgerService,
    options: {
      redisUrl?: string;
      prefix?: string;
      enabled?: boolean;
      preparationMs?: number;
    } = {},
  ) {
    this.prefix = options.prefix ?? BID_STREAM_NAMESPACE;
    if (!/^[a-zA-Z0-9:_-]{1,160}$/.test(this.prefix))
      throw new Error('Invalid bid namespace.');
    this.enabled = options.enabled ?? process.env.BIDS_ENABLED === 'true';
    this.preparationMs =
      options.preparationMs ??
      Number(process.env.BID_PREPARATION_MS ?? BID_PREPARATION_MS);
    if (!Number.isSafeInteger(this.preparationMs) || this.preparationMs <= 0)
      throw new Error('Invalid preparation lifetime.');
    this.redis = createClient({
      url: options.redisUrl ?? process.env.REDIS_URL,
      disableOfflineQueue: true,
      commandOptions: { timeout: 5000 },
      socket: { reconnectStrategy: false, connectTimeout: 5000 },
    });
    this.redis.on('error', () => {
      this.ready = false;
    });
    this.redis.on('end', () => {
      this.ready = false;
    });
    this.fees = new AuctionFeeService(ledger, this.redis, this.prefix);
    this.issues = new LiveIssues(this.redis, this.prefix);
  }
  async start() {
    if (!this.enabled) return;
    if (this.started) {
      this.available();
      return;
    }
    try {
      await this.redis.connect();
      if (await this.redis.exists(`${this.prefix}recovery`))
        throw new Error('Operator recovery is not complete.');
      const config = await this.redis.configGet([
        'appendonly',
        'appendfsync',
        'maxmemory-policy',
        'no-appendfsync-on-rewrite',
      ]);
      if (
        config.appendonly !== 'yes' ||
        config.appendfsync !== 'always' ||
        config['maxmemory-policy'] !== 'noeviction' ||
        config['no-appendfsync-on-rewrite'] !== 'no'
      )
        throw new Error('Durable Redis configuration required.');
      const info = await this.redis.info('server');
      const runId = /^run_id:(\w+)/m.exec(info)?.[1];
      if (!runId) throw new Error('Redis identity unavailable.');
      const database = await this.ledger.db.$queryRaw<
        { name: string }[]
      >`SELECT current_database() AS name`;
      const marker = digest(
        JSON.stringify([database[0]?.name, this.prefix, runId]),
      );
      const existing = await this.ledger.db.bidEngineRuntime.findUnique({
        where: { namespace: this.prefix },
      });
      if (
        existing &&
        (await this.redis.get(`${this.prefix}runtime`)) !== marker
      )
        throw new Error('Redis namespace requires reconciliation.');
      if (!existing) {
        for await (const keys of this.redis.scanIterator({
          MATCH: `${this.prefix}*`,
          COUNT: 10000,
        })) {
          if (keys.length)
            throw new Error('Unowned Redis state requires reconciliation.');
        }
      }
      const runtime = await this.ledger.db.bidEngineRuntime.upsert({
        where: { namespace: this.prefix },
        create: { namespace: this.prefix, redisRunId: runId },
        update: {},
      });
      if (runtime.redisRunId !== runId)
        throw new Error('Redis restart requires reviewed recovery.');
      await this.redis.set(`${this.prefix}runtime`, marker, { NX: true });
      await this.fees.activate();
      this.scriptSha = await this.redis.scriptLoad(BID_LUA);
      const unfinished = await this.ledger.db.auctionPauseCommand.findFirst({
        where: { namespace: this.prefix, status: { not: 'completed' } },
      });
      const last = await this.ledger.db.auctionPauseCommand.findFirst({
        where: { namespace: this.prefix, status: 'completed' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      const controlRaw = await this.redis.get(
        auctionControlPrefix(this.prefix) + 'state',
      );
      if (last && !controlRaw)
        throw new Error('Durable auction control state requires review.');
      if (last && controlRaw && !unfinished) {
        let control = auctionPauseStateSchema.parse(JSON.parse(controlRaw));
        if (
          last.operation === 'resume_all' &&
          control.phase === 'resuming' &&
          control.resumeId === last.id &&
          control.finalizedAt
        ) {
          await this.restoreLaunchProofClocks();
          control = auctionPauseStateSchema.parse(
            JSON.parse(
              String(
                await this.redis.eval(AUCTION_PAUSE_LUA, {
                  keys: [this.prefix],
                  arguments: ['resume_open', last.id],
                }),
              ),
            ),
          );
        }
        if (
          (last.operation === 'pause_all' &&
            (control.phase !== 'paused' || control.pauseId !== last.id)) ||
          (last.operation === 'resume_all' &&
            (control.phase !== 'live' || control.resumeId !== last.id))
        )
          throw new Error('Auction control journal conflicts with Redis.');
      }
      if (unfinished?.operation === 'pause_all')
        await this.redis.eval(AUCTION_PAUSE_LUA, {
          keys: [this.prefix],
          arguments: ['pause', unfinished.id],
        });
      this.ready = true;
      this.started = true;
      await this.issues.heartbeat();
      await this.loadOpenLots();
    } catch {
      if (this.redis.isOpen) this.redis.destroy();
      throw new ServiceUnavailableException(
        'Bidding is paused pending durable Redis recovery.',
      );
    }
  }
  async onModuleDestroy() {
    await this.close();
  }
  async close() {
    const wasReady = this.ready;
    this.ready = false;
    if (!this.redis.isOpen) return;
    if (!wasReady) {
      this.redis.destroy();
      return;
    }
    try {
      await this.redis.quit();
    } catch {
      if (this.redis.isOpen) this.redis.destroy();
    }
  }
  private available() {
    if (!this.enabled || !this.ready || !this.redis.isReady)
      throw new ServiceUnavailableException('Bidding is unavailable.');
  }
  private binding(token: string, device: string, key: string) {
    return digest(JSON.stringify([token, device, key]));
  }
  private async live(lotId: string): Promise<LiveLot> {
    const raw = await this.redis.get(`${this.prefix}lot:${lotId}`);
    if (!raw) throw new ConflictException('This lot is unavailable.');
    return JSON.parse(raw) as LiveLot;
  }
  async auctionFeeQuote(lotId: string) {
    const lot = await this.ledger.db.lot.findUnique({ where: { id: lotId } });
    if (!lot) throw new ConflictException('This auction is unavailable.');
    if (lot.auctionFeeVersion)
      return {
        policy: await this.fees.policy(lot.auctionFeeVersion),
        locked: true,
      };
    this.available();
    const raw = await this.redis.get(this.prefix + 'lot:' + lotId);
    const state = raw ? (JSON.parse(raw) as LiveLot) : undefined;
    if (state?.leader)
      return { policy: await this.fees.policy(state.feeVersion), locked: true };
    return { policy: await this.fees.active(), locked: false };
  }
  private async loadOpenLots() {
    const cursor = this.warmCursor;
    const rows = await this.ledger.db.lot.findMany({
      where: {
        status: { in: ['open', 'closing'] },
        startAt: { lte: new Date() },
        endAt: { gt: new Date() },
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
      select: {
        id: true,
        startPriceKobo: true,
        startAt: true,
        endAt: true,
        auctionFeeVersion: true,
        bidRound: true,
      },
    });
    for (const lot of rows)
      await this.redis.set(
        `${this.prefix}lot:${lot.id}`,
        JSON.stringify({
          open: true,
          startPriceKobo: fromLedgerKobo(lot.startPriceKobo),
          startsAt: lot.startAt.getTime(),
          currentPriceKobo: null,
          leader: null,
          groupId: null,
          endsAt: lot.endAt.getTime(),
          feeVersion: lot.auctionFeeVersion ?? BID_FEE_VERSION,
          feeLocked: lot.auctionFeeVersion !== null,
          bidRound: lot.bidRound,
        }),
        { NX: true },
      );
    const last = rows.at(-1);
    this.warmCursor =
      rows.length === 50 && last
        ? { endAt: last.endAt, id: last.id }
        : undefined;
  }
  async loadLot(lotId: string) {
    this.available();
    const lot = await this.ledger.db.lot.findUnique({ where: { id: lotId } });
    if (
      !lot ||
      !['open', 'closing'].includes(lot.status) ||
      lot.startAt.getTime() > Date.now()
    )
      throw new ConflictException('This lot is not open.');
    const existing = await this.redis.get(`${this.prefix}lot:${lotId}`);
    if (existing) {
      const state = JSON.parse(existing) as LiveLot;
      const pause = await this.auctionPauseState();
      const cutoff =
        pause.phase === 'live' ? Date.now() : (pause.pausedAt ?? Date.now());
      if (!state.open || state.endsAt <= cutoff)
        throw new ConflictException('This lot has closed.');
      return state;
    }
    const pause = await this.auctionPauseState();
    if (
      lot.endAt.getTime() <=
      (pause.phase === 'live' ? Date.now() : (pause.pausedAt ?? Date.now()))
    )
      throw new ConflictException('This lot has closed.');
    await this.redis.set(
      `${this.prefix}lot:${lotId}`,
      JSON.stringify({
        open: true,
        startPriceKobo: fromLedgerKobo(lot.startPriceKobo),
        startsAt: lot.startAt.getTime(),
        currentPriceKobo: null,
        leader: null,
        groupId: null,
        endsAt: lot.endAt.getTime(),
        feeVersion: lot.auctionFeeVersion ?? BID_FEE_VERSION,
        feeLocked: lot.auctionFeeVersion !== null,
        bidRound: lot.bidRound,
      }),
      { NX: true },
    );
    return this.live(lotId);
  }
  private dto(intent: BidFundingIntent) {
    return bidPreparationSchema.parse({
      preparationId: intent.id,
      idempotencyKey: intent.requestKey,
      lotId: intent.lotId,
      maxKobo: fromLedgerKobo(intent.maxKobo),
      mode: intent.mode,
      totalKobo: fromLedgerKobo(intent.totalKobo),
      reservedKobo: fromLedgerKobo(intent.reservedKobo),
      expiresAt: intent.expiresAt.toISOString(),
      feeVersion: intent.feeVersion,
    });
  }
  private async publishProof(intent: BidFundingIntent) {
    if (intent.status === 'released') return;
    if (intent.status === 'retained') {
      if (!(await this.redis.exists(`${this.prefix}proof:${intent.id}`))) {
        this.ready = false;
        throw new ServiceUnavailableException(
          'An accepted proof is missing. Recovery review required.',
        );
      }
      return;
    }
    // NX makes a retry after an uncertain SET safe: terminal proofs are never reopened.
    await this.redis.set(
      `${this.prefix}proof:${intent.id}`,
      JSON.stringify({
        userId: intent.userId,
        sessionId: intent.isPreBid ? undefined : intent.sessionId,
        preBidId: intent.isPreBid ? intent.id : undefined,
        maxKobo: fromLedgerKobo(intent.maxKobo),
        bidRound: intent.bidRound,
        mode: intent.mode,
        totalKobo: fromLedgerKobo(intent.totalKobo),
        reservedKobo: fromLedgerKobo(intent.reservedKobo),
        lotId: intent.lotId,
        groupId: intent.groupId,
        baseMaxKobo:
          intent.baseMaxKobo === null
            ? null
            : fromLedgerKobo(intent.baseMaxKobo),
        expiresAt: intent.expiresAt.getTime(),
        binding: intent.binding,
        feeVersion: intent.feeVersion,
        status: 'ready',
      }),
      { NX: true },
    );
  }
  async prepare(
    identity: BidIdentity,
    lotId: string,
    input: PrepareBidInput,
    token: string,
    device: string,
  ) {
    this.available();
    const parsed = prepareBidSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException();
    const requestHash = digest(
      JSON.stringify([
        lotId,
        parsed.data.maxKobo,
        identity.sessionId,
        this.binding(token, device, input.idempotencyKey),
        // Preserve the original hash for legacy automatic reservations.
        ...(parsed.data.mode === 'direct' ? ['direct'] : []),
        ...(parsed.data.feeVersion === BID_FEE_VERSION
          ? []
          : [parsed.data.feeVersion]),
      ]),
    );
    return this.ledger.db
      .$transaction(
        async (tx) => {
          // The same locks fence logout and eligibility changes against proof publication.
          await tx.$queryRaw`SELECT id FROM users WHERE id=${identity.userId}::uuid FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${identity.sessionId}::uuid FOR UPDATE`;
          const session = await tx.authSession.findUnique({
            where: { id: identity.sessionId },
            include: {
              user: {
                include: {
                  wallet: true,
                  strikes: { where: { revokedAt: null }, take: 3 },
                },
              },
            },
          });
          if (
            !session ||
            session.userId !== identity.userId ||
            session.revokedAt ||
            session.accessExpiresAt.getTime() <= Date.now() ||
            session.expiresAt.getTime() <= Date.now() ||
            !isBuyerEligible({
              role: session.user.role,
              status: session.user.status,
              emailVerified: session.user.emailVerifiedAt !== null,
            }) ||
            session.user.strikes.length >= 3 ||
            !session.user.wallet
          )
            throw new ForbiddenException();
          if (await this.redis.hExists(`${this.prefix}revoked`, session.id))
            throw new ForbiddenException();
          const previous = await tx.bidFundingIntent.findUnique({
            where: {
              userId_requestKey: {
                userId: identity.userId,
                requestKey: input.idempotencyKey,
              },
            },
          });
          if (previous) {
            if (
              previous.requestHash !== requestHash ||
              previous.namespace !== this.prefix
            )
              throw new ConflictException();
            if (previous.status !== 'released')
              await this.publishProof(previous);
            return this.dto(previous);
          }
          const recent = await tx.bidFundingIntent.count({
            where: {
              userId: identity.userId,
              createdAt: { gte: new Date(Date.now() - 60000) },
            },
          });
          if (recent >= BID_PREPARE_LIMIT)
            throw new HttpException('Too many preparations.', 429);
          const state = await this.loadLot(lotId);
          if (await this.redis.exists(`${this.prefix}cancellation:${lotId}`))
            throw new ConflictException(
              'This auction is being reviewed. Retry shortly.',
            );
          if (
            await tx.bidCancellationApproval.findFirst({
              where: {
                lotId,
                buyerId: identity.userId,
                status: { in: ['committed', 'completed'] },
              },
            })
          )
            throw new ForbiddenException(
              'Your bids on this item were cancelled by staff.',
            );
          const policy =
            state.leader || state.feeLocked
              ? await this.fees.policy(state.feeVersion)
              : await this.fees.active();
          if (parsed.data.feeVersion !== policy.version)
            throw new ConflictException(
              'Auction fees changed. Review the fees before bidding.',
            );
          const rules = effectiveAuctionFeeRules(policy);
          const own = state.leader?.bidderId === identity.userId;
          const baseMax = own ? state.leader?.maxKobo : undefined;
          if (
            (baseMax !== undefined && input.maxKobo <= baseMax) ||
            (!own &&
              input.maxKobo <
                minNextBid(state.startPriceKobo, state.currentPriceKobo)) ||
            (own &&
              parsed.data.mode === 'direct' &&
              input.maxKobo <
                minNextBid(state.startPriceKobo, state.currentPriceKobo))
          )
            throw new ConflictException();
          const total = estimatedTotal(input.maxKobo, rules);
          const delta =
            total -
            (baseMax === undefined ? 0 : estimatedTotal(baseMax, rules));
          const id = randomUUID();
          const holdId = delta ? randomUUID() : null;
          // Durable intent + double-entry reservation commit together before Redis can consume it.
          if (holdId)
            await this.ledger.holdInTransaction(tx, {
              walletId: session.user.wallet.id,
              holdId,
              amountKobo: BigInt(delta),
              idempotencyKey: `bid:reserve:${id}`,
              reference: `bid:reserve:${id}`,
            });
          const intent = await tx.bidFundingIntent.create({
            data: {
              id,
              userId: identity.userId,
              sessionId: identity.sessionId,
              walletId: session.user.wallet.id,
              lotId,
              holdId,
              groupId: own && state.groupId ? state.groupId : randomUUID(),
              requestKey: input.idempotencyKey,
              requestHash,
              binding: this.binding(token, device, input.idempotencyKey),
              namespace: this.prefix,
              maxKobo: BigInt(input.maxKobo),
              mode: parsed.data.mode,
              bidRound: state.bidRound ?? 0,
              totalKobo: BigInt(total),
              reservedKobo: BigInt(delta),
              baseMaxKobo: baseMax === undefined ? null : BigInt(baseMax),
              feeVersion: policy.version,
              expiresAt: new Date(
                Math.min(
                  Date.now() + this.preparationMs,
                  session.accessExpiresAt.getTime(),
                  session.expiresAt.getTime(),
                ),
              ),
            },
          });
          return this.dto(intent);
        },
        { maxWait: 60000, timeout: 15000 },
      )
      .then(async (dto) => {
        // Re-lock the session while publishing; revocation cannot slip between checking and SET.
        await this.ledger.db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM users WHERE id=${identity.userId}::uuid FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${identity.sessionId}::uuid FOR UPDATE`;
          const session = await tx.authSession.findUniqueOrThrow({
            where: { id: identity.sessionId },
            include: { user: true },
          });
          if (
            session.revokedAt ||
            !isBuyerEligible({
              role: session.user.role,
              status: session.user.status,
              emailVerified: session.user.emailVerifiedAt !== null,
            })
          )
            throw new ForbiddenException();
          const intent = await tx.bidFundingIntent.findUniqueOrThrow({
            where: { id: dto.preparationId },
          });
          if (intent.status !== 'released') await this.publishProof(intent);
        });
        return dto;
      })
      .catch(async (error: unknown) => {
        if (error instanceof InsufficientFundsError)
          await this.issues.record(
            'wallet',
            `${identity.userId}:${input.idempotencyKey}`,
          );
        throw error;
      });
  }
  private async command(
    op: string,
    id: string,
    binding: string,
    lotId: string,
    ip?: string,
  ): Promise<EngineResult> {
    this.available();
    try {
      if (!this.scriptSha) throw new Error('Bid script is unavailable.');
      const result = await this.redis.evalSha(this.scriptSha, {
        keys: [this.prefix],
        arguments: [op, id, binding, lotId, ...(ip ? ['', digest(ip)] : [])],
      });
      const decoded = JSON.parse(String(result)) as EngineResult;
      if (decoded.reason === 'unavailable')
        throw new Error('Bid namespace is inconsistent.');
      return decoded;
    } catch {
      this.ready = false;
      throw new ServiceUnavailableException(
        'Bid outcome is uncertain. Retry the same request.',
      );
    }
  }
  async accept(
    lotId: string,
    input: ConfirmBidInput,
    token: string,
    device: string,
    ip?: string,
  ) {
    const parsed = confirmBidSchema.safeParse({
      preparationId: input.preparationId,
      idempotencyKey: input.idempotencyKey,
    });
    if (!parsed.success) throw new BadRequestException();
    const result = await this.command(
      'accept',
      input.preparationId,
      this.binding(token, device, input.idempotencyKey),
      lotId,
      ip,
    );
    if (result.reason === 'rate')
      throw new HttpException('Too many bid attempts.', 429);
    if (
      result.status !== 'accepted' ||
      !result.state ||
      result.state.currentPriceKobo === null ||
      !result.streamId ||
      result.serverTime === undefined
    )
      throw new ConflictException('Bid was not accepted.');
    // Never return another bidder's identity or secret proxy maximum to a client.
    return bidResultSchema.parse({
      status: 'accepted',
      mode: result.mode ?? 'automatic',
      isLeader: result.isLeader,
      currentPriceKobo: result.state.currentPriceKobo,
      endsAt: new Date(result.state.endsAt).toISOString(),
      serverTime: new Date(result.serverTime).toISOString(),
      streamId: result.streamId,
    });
  }
  async cancel(identity: BidIdentity, id: string) {
    this.available();
    const intent = await this.ledger.db.bidFundingIntent.findFirst({
      where: { id, userId: identity.userId, namespace: this.prefix },
    });
    if (!intent) throw new ForbiddenException();
    if (intent.isPreBid)
      throw new ForbiddenException(
        'Manage this pre-bid before launch on the item page.',
      );
    if (intent.status === 'released') return { status: 'cancelled' };
    await this.publishProof(intent);
    const result = await this.command(
      'cancel',
      id,
      intent.binding,
      intent.lotId,
    );
    await this.releaseIfTerminal(intent);
    return { status: result.status };
  }
  async revokeSessions(ids: string[]) {
    if (!this.enabled) {
      if (
        await this.ledger.db.bidEngineRuntime.findUnique({
          where: { namespace: this.prefix },
        })
      )
        throw new ServiceUnavailableException(
          'Bid revocation requires the bidding engine.',
        );
      return;
    }
    this.available();
    for (const id of ids)
      await this.redis.hSet(`${this.prefix}revoked`, id, '1');
  }
  private async releaseIfTerminal(intent: BidFundingIntent) {
    const result = await this.command(
      'status',
      intent.id,
      intent.binding,
      intent.lotId,
    );
    const releasable = ['cancelled', 'rejected', 'outbid'].includes(
      result.status,
    );
    if (!releasable) {
      if (result.status === 'accepted')
        await this.ledger.db.bidFundingIntent.updateMany({
          where: { id: intent.id, status: 'pending' },
          data: { status: 'retained' },
        });
      return;
    }
    if (intent.holdId) {
      try {
        await this.ledger.releaseHold({
          walletId: intent.walletId,
          holdId: intent.holdId,
          idempotencyKey: `bid:release:${intent.id}`,
          reference: `bid:release:${intent.id}`,
        });
      } catch (error) {
        await this.issues.record('release', intent.holdId);
        throw error;
      }
    }
    await this.ledger.db.bidFundingIntent.update({
      where: { id: intent.id },
      data: { status: 'released' },
    });
  }
  async lockEligibility(tx: Prisma.TransactionClient, userId: string) {
    await tx.$queryRaw`SELECT id FROM users WHERE id=${userId}::uuid FOR UPDATE`;
    const sessions = await tx.authSession.findMany({
      where: { userId, revokedAt: null },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    for (const session of sessions)
      await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${session.id}::uuid FOR UPDATE`;
    return sessions;
  }
  async fenceEligibility(tx: Prisma.TransactionClient, userId: string) {
    const sessions = await this.lockEligibility(tx, userId);
    await this.revokeSessions(sessions.map((session) => session.id));
    await tx.$executeRaw`SELECT set_config('auction_ng.bid_fenced','on',true)`;
  }
  async maintain() {
    this.available();
    await this.issues.heartbeat();
    await this.loadOpenLots();
    // Bounded rotating scan prevents leading bids starving later abandoned preparations.
    let rows = await this.ledger.db.bidFundingIntent.findMany({
      where: {
        namespace: this.prefix,
        status: { not: 'released' },
        ...(this.cursor ? { id: { gt: this.cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: 50,
    });
    if (!rows.length && this.cursor) {
      this.cursor = undefined;
      rows = await this.ledger.db.bidFundingIntent.findMany({
        where: { namespace: this.prefix, status: { not: 'released' } },
        orderBy: { id: 'asc' },
        take: 50,
      });
    }
    const pause = await this.auctionPauseState();
    for (const intent of rows) {
      if (intent.isPreBid && pause.phase !== 'live') {
        this.cursor = intent.id;
        continue;
      }
      // Missing proof is recreated only from a durable funded intent in this same Redis process.
      await this.publishProof(intent);
      await this.command('expire', intent.id, intent.binding, intent.lotId);
      await this.releaseIfTerminal(intent);
      this.cursor = intent.id;
    }
    return { checked: rows.length };
  }
  async beginScheduledLaunch(lotId: string) {
    this.available();
    const lot = await this.ledger.db.lot.findUniqueOrThrow({
      where: { id: lotId },
    });
    if (
      lot.status !== 'scheduled' ||
      !lot.preBidsLaunching ||
      lot.startAt.getTime() > Date.now()
    )
      throw new ConflictException('Auction is not ready to launch.');
    const feeVersion =
      lot.auctionFeeVersion ?? (await this.fees.active()).version;
    const initial = JSON.stringify({
      open: true,
      startPriceKobo: fromLedgerKobo(lot.startPriceKobo),
      currentPriceKobo: null,
      leader: null,
      groupId: null,
      startsAt: lot.startAt.getTime(),
      endsAt: lot.endAt.getTime(),
      feeVersion,
      feeLocked: lot.auctionFeeVersion !== null,
      launching: true,
    });
    await this.redis.eval(
      `local pause=redis.call('GET',KEYS[2]);if pause and cjson.decode(pause).phase~='live' then return redis.error_reply('Auction launch is paused') end;local raw=redis.call('GET',KEYS[1]); if not raw then redis.call('SET',KEYS[1],ARGV[1]); return 1 end; local lot=cjson.decode(raw); if not lot.open then return redis.error_reply('Launch state closed') end; if lot.launching==nil then raw=string.sub(raw,1,-2)..',"launching":true}' else raw=string.gsub(raw,'"launching"%s*:%s*false','"launching":true') end; redis.call('SET',KEYS[1],raw); return 1`,
      {
        keys: [
          this.prefix + 'lot:' + lotId,
          auctionControlPrefix(this.prefix) + 'state',
        ],
        arguments: [initial],
      },
    );
  }
  assertPreBidAvailable() {
    this.available();
  }
  async finishScheduledLaunch(lotId: string) {
    this.available();
    await this.redis.eval(
      `local raw=redis.call('GET',KEYS[1]); local lot=cjson.decode(raw); if not lot.open then return redis.error_reply('Launch state closed') end; raw=string.gsub(raw,'"launching"%s*:%s*true','"launching":false'); redis.call('SET',KEYS[1],raw); return 1`,
      { keys: [this.prefix + 'lot:' + lotId], arguments: [] },
    );
  }
  async activateScheduledPreBid(id: string, tx: Prisma.TransactionClient) {
    this.available();
    const intent = await tx.bidFundingIntent.findUniqueOrThrow({
      where: { id },
    });
    if (!intent.isPreBid) throw new ForbiddenException();
    await this.publishProof(intent);
    const before = await this.command(
      'status',
      intent.id,
      intent.binding,
      intent.lotId,
    );
    if (!['accepted', 'outbid'].includes(before.status)) {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: intent.userId },
        include: { strikes: { where: { revokedAt: null }, take: 3 } },
      });
      if (
        !isBuyerEligible({
          role: user.role,
          status: user.status,
          emailVerified: user.emailVerifiedAt !== null,
        }) ||
        user.strikes.length >= 3
      ) {
        await this.command('cancel', intent.id, intent.binding, intent.lotId);
        await this.releaseIfTerminal(intent);
        return { status: 'rejected' };
      }
    }
    const result = await this.command(
      'accept',
      intent.id,
      intent.binding,
      intent.lotId,
    );
    if (result.reason === 'paused') return { status: 'paused' };
    await this.releaseIfTerminal(intent);
    return { status: result.status, streamId: result.streamId };
  }
  async persist(streamIds: string[]) {
    this.available();
    return persistAcceptedBids(this.ledger, this.redis, this.prefix, streamIds);
  }
  async releaseClosedPreparations(lotId: string) {
    this.available();
    let cursor: string | undefined;
    for (;;) {
      const rows = await this.ledger.db.bidFundingIntent.findMany({
        where: {
          namespace: this.prefix,
          lotId,
          status: { not: 'released' },
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: 50,
      });
      for (const intent of rows) {
        await this.publishProof(intent);
        await this.command('cancel', intent.id, intent.binding, intent.lotId);
        await this.releaseIfTerminal(intent);
      }
      cursor = rows.at(-1)?.id;
      if (rows.length < 50) return;
    }
  }
  async freezeLot(lotId: string) {
    this.available();
    const lot = await this.ledger.db.lot.findUniqueOrThrow({
      where: { id: lotId },
    });
    if (!['open', 'closing', 'closed'].includes(lot.status))
      throw new ConflictException('Lot is not closable.');
    if (!(await this.redis.exists(`${this.prefix}lot:${lotId}`))) {
      if (await this.ledger.db.bidFundingIntent.count({ where: { lotId } }))
        throw new ConflictException('Missing bid state needs review.');
      if (await this.ledger.db.bid.count({ where: { lotId } }))
        throw new ConflictException('Missing bid history needs review.');
      await this.redis.set(
        `${this.prefix}lot:${lotId}`,
        JSON.stringify({
          open: true,
          startPriceKobo: fromLedgerKobo(lot.startPriceKobo),
          currentPriceKobo: null,
          leader: null,
          groupId: null,
          endsAt: lot.endAt.getTime(),
          feeVersion: lot.auctionFeeVersion ?? BID_FEE_VERSION,
          feeLocked: lot.auctionFeeVersion !== null,
        }),
        { NX: true },
      );
    }
    const result = JSON.parse(
      String(
        await this.redis.eval(CLOSE_LUA, {
          keys: [this.prefix],
          arguments: [lotId],
        }),
      ),
    ) as { status: string; endsAt?: number; snapshot?: unknown };
    if (['reserved', 'paused'].includes(result.status)) return null;
    if (result.status === 'extended' && Number.isSafeInteger(result.endsAt)) {
      await this.ledger.db.lot.updateMany({
        where: { id: lotId, status: { in: ['open', 'closing'] } },
        data: { endAt: new Date(result.endsAt ?? 0) },
      });
      return null;
    }
    if (result.status !== 'frozen')
      throw new ConflictException('Closing state needs review.');
    return closingSnapshotSchema.parse(result.snapshot);
  }
  async persistThrough(barrier: string) {
    this.available();
    // A durable, contiguous prefix proves pending and undelivered entries committed.
    // Never infer completion from the consumer group's last-delivered coordinate.
    for (;;) {
      const complete = await this.ledger.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${this.prefix},0))`;
          const cursor = await tx.closingCursor.upsert({
            where: { namespace: this.prefix },
            create: { namespace: this.prefix },
            update: {},
          });
          if (compareStreamIds(cursor.streamId, barrier) >= 0) return true;
          const entries = await this.redis.xRange(
            `${this.prefix}accepted`,
            `(${cursor.streamId}`,
            barrier,
            { COUNT: 50 },
          );
          if (!entries.length)
            throw new ConflictException('Closing barrier is missing.');
          await persistAcceptedBids(
            this.ledger,
            this.redis,
            this.prefix,
            entries.map((e) => e.id),
            tx,
          );
          const last = entries.at(-1);
          if (!last) throw new ConflictException();
          await tx.closingCursor.update({
            where: { namespace: this.prefix },
            data: { streamId: last.id },
          });
          return last.id === barrier;
        },
        { maxWait: 60000, timeout: 15000 },
      );
      if (complete) return;
    }
  }
  async persistedBidCutoff() {
    this.available();
    const result = await this.redis.eval(
      `local t=redis.call('TIME');local last=redis.call('XREVRANGE',KEYS[1],'+','-','COUNT',1);return {t[1],t[2],last[1] and last[1][1] or '0-0'}`,
      { keys: [this.prefix + 'accepted'], arguments: [] },
    );
    const [seconds, micros, barrier] = z
      .tuple([z.string(), z.string(), z.string()])
      .parse(result);
    await this.persistThrough(barrier);
    return new Date(Number(seconds) * 1000 + Math.floor(Number(micros) / 1000));
  }
  async auctionPauseState() {
    this.available();
    const raw = await this.redis.get(
      auctionControlPrefix(this.prefix) + 'state',
    );
    return auctionPauseStateSchema.parse(
      raw ? JSON.parse(raw) : { phase: 'live' },
    );
  }
  async guardAuctionPublication(
    tx: Prisma.TransactionClient,
    allowPaused = false,
  ) {
    if (!this.enabled) return;
    this.available();
    await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${this.prefix},716))`;
    const state = await this.auctionPauseState();
    if (state.phase === 'resuming' || (!allowPaused && state.phase !== 'live'))
      throw new ConflictException(
        'Publishing and schedule changes are paused until bidding resumes. Drafts can still be edited.',
      );
    if (
      !allowPaused &&
      (await tx.auctionPauseCommand.findFirst({
        where: { namespace: this.prefix, status: { not: 'completed' } },
      }))
    )
      throw new ConflictException(
        'A global bidding control is being applied. Try again after it completes.',
      );
  }
  async applyAuctionPause(
    operation: 'pause' | 'resume_begin' | 'resume_finish' | 'resume_open',
    id: string,
  ) {
    this.available();
    z.uuid().parse(id);
    if (operation === 'resume_open') await this.restoreLaunchProofClocks();
    return auctionPauseStateSchema.parse(
      JSON.parse(
        String(
          await this.redis.eval(AUCTION_PAUSE_LUA, {
            keys: [this.prefix],
            arguments: [operation, id],
          }),
        ),
      ),
    );
  }
  async applyResumeLot(
    id: string,
    lotId: string,
    oldEnd: number,
    newEnd: number,
  ) {
    this.available();
    z.uuid().parse(id);
    z.uuid().parse(lotId);
    return z.enum(['applied', 'skipped']).parse(
      await this.redis.eval(AUCTION_RESUME_LOT_LUA, {
        keys: [this.prefix],
        arguments: [lotId, id, String(oldEnd), String(newEnd)],
      }),
    );
  }
  async resumePreBidIntents(
    tx: Prisma.TransactionClient,
    lotId: string,
    endsAt: number,
  ) {
    let cursor: string | undefined;
    for (;;) {
      const intents = await tx.bidFundingIntent.findMany({
        where: {
          namespace: this.prefix,
          lotId,
          isPreBid: true,
          status: 'funded',
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: 50,
      });
      for (const intent of intents) {
        await tx.bidFundingIntent.update({
          where: { id: intent.id },
          data: { expiresAt: new Date(endsAt) },
        });
        await this.redis.eval(
          `local raw=redis.call('GET',KEYS[1]);if raw and cjson.decode(raw).status=='ready' then raw=string.gsub(raw,'"expiresAt"%s*:%s*%d+','"expiresAt":'..ARGV[1],1);redis.call('SET',KEYS[1],raw) end;return 1`,
          {
            keys: [this.prefix + 'proof:' + intent.id],
            arguments: [String(endsAt)],
          },
        );
      }
      if (intents.length < 50) return;
      cursor = intents.at(-1)?.id;
    }
  }
  private async restoreLaunchProofClocks() {
    let cursor: string | undefined;
    const visited = new Set<string>();
    for (;;) {
      const intents = await this.ledger.db.bidFundingIntent.findMany({
        where: {
          namespace: this.prefix,
          isPreBid: true,
          status: 'funded',
          lot: { is: { preBidsLaunching: true } },
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: 50,
        select: { id: true, lotId: true, lot: { select: { endAt: true } } },
      });
      for (const intent of intents) {
        if (visited.has(intent.lotId)) continue;
        visited.add(intent.lotId);
        await this.ledger.db.$transaction((tx) =>
          this.resumePreBidIntents(
            tx,
            intent.lotId,
            intent.lot.endAt.getTime(),
          ),
        );
      }
      if (intents.length < 50) return;
      cursor = intents.at(-1)?.id;
    }
  }
  async snapshot(identity: BidIdentity | null, lotId: string) {
    const state = (await this.loadLot(lotId)) as LiveLot & {
      streamId?: string;
    };
    const clock = await this.redis.sendCommand(['TIME']);
    if (!Array.isArray(clock)) throw new ServiceUnavailableException();
    const now = Number(clock[0]) * 1000 + Math.floor(Number(clock[1]) / 1000);
    const pause = await this.auctionPauseState();
    const pausedAt =
      pause.phase !== 'live' && pause.pausedAt !== undefined
        ? Math.max(pause.pausedAt, state.startsAt ?? pause.pausedAt)
        : undefined;
    const bookClock = state as LiveLot & {
      pauseId?: string;
      pauseEndsAt?: number;
    };
    const endsAt =
      pausedAt !== undefined && bookClock.pauseId === pause.pauseId
        ? (bookClock.pauseEndsAt ?? state.endsAt)
        : state.endsAt;
    return liveLotSchema.parse({
      lotId,
      currentPriceKobo: state.currentPriceKobo,
      endsAt: new Date(endsAt).toISOString(),
      streamId: state.streamId ?? '0-0',
      serverTime: new Date(now).toISOString(),
      isLeader: identity !== null && state.leader?.bidderId === identity.userId,
      ...(pausedAt === undefined ? {} : { pausedAt }),
    });
  }
  async publicBrowseStates(ids: string[]) {
    this.available();
    z.array(z.uuid()).max(200).parse(ids);
    const [values, clock] = await Promise.all([
      ids.length
        ? this.redis.mGet(ids.map((id) => `${this.prefix}lot:${id}`))
        : Promise.resolve([]),
      this.redis.sendCommand(['TIME']),
    ]);
    if (!Array.isArray(clock)) throw new ServiceUnavailableException();
    const now = Number(clock[0]) * 1000 + Math.floor(Number(clock[1]) / 1000);
    if (!Number.isSafeInteger(now)) throw new ServiceUnavailableException();
    const pause = await this.auctionPauseState();
    return {
      states: values.map((raw) => {
        if (!raw) return null;
        const state = publicBrowseStateSchema.parse(JSON.parse(raw));
        if (pause.phase === 'live' || pause.pausedAt === undefined)
          return state;
        const book = monitorBook(raw);
        const original =
          book && book.pauseId === pause.pauseId
            ? (book.pauseEndsAt ?? state.endsAt)
            : state.endsAt;
        return {
          ...state,
          endsAt:
            now +
            Math.max(
              0,
              original -
                Math.max(pause.pausedAt, book?.startsAt ?? pause.pausedAt),
            ),
        };
      }),
      serverTime: new Date(now).toISOString(),
    };
  }
  async monitorBooks(ids: string[]) {
    this.available();
    z.array(z.uuid()).max(200).parse(ids);
    const [values, clock] = await Promise.all([
      ids.length
        ? this.redis.mGet(ids.map((id) => this.prefix + 'lot:' + id))
        : Promise.resolve([]),
      this.redis.sendCommand(['TIME']),
    ]);
    if (!Array.isArray(clock)) throw new ServiceUnavailableException();
    const now = Number(clock[0]) * 1000 + Math.floor(Number(clock[1]) / 1000);
    if (!Number.isSafeInteger(now)) throw new ServiceUnavailableException();
    return {
      states: values.map(monitorBook),
      serverTime: new Date(now).toISOString(),
    };
  }
  async purchaseGate(
    lotId: string,
    purchaseId: string,
    operation: 'reserve' | 'commit' | 'sold' | 'release',
    expiresAt = 0,
  ) {
    this.available();
    if (operation === 'reserve') await this.loadLot(lotId);
    return JSON.parse(
      String(
        await this.redis.eval(PURCHASE_LUA, {
          keys: [this.prefix],
          arguments: [lotId, purchaseId, operation, String(expiresAt)],
        }),
      ),
    ) as { status: string; expiresAt?: number; barrierId?: string };
  }
  async cancellationBook(lotId: string) {
    return this.loadLot(lotId);
  }
  async cancellationGate(
    lotId: string,
    operation: 'begin' | 'commit' | 'abort',
    id: string,
    buyerId: string,
    expectedStreamId = '0-0',
  ): Promise<unknown> {
    this.available();
    return JSON.parse(
      String(
        await this.redis.eval(CANCELLATION_LUA, {
          keys: [this.prefix],
          arguments: [lotId, operation, id, buyerId, expectedStreamId],
        }),
      ),
    );
  }
}
