import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createClient } from 'redis';
import {
  BID_FEE_VERSION,
  BID_STREAM_NAMESPACE,
  BID_PREPARATION_MS,
  BID_PREPARE_LIMIT,
  bidPreparationSchema,
  bidResultSchema,
  prepareBidSchema,
  confirmBidSchema,
  estimatedTotal,
  fromLedgerKobo,
  minNextBid,
  type PrepareBidInput,
  type ConfirmBidInput,
  type AuctionState,
} from '@auction-ng/shared';
import { LedgerService } from '../ledger/ledger-service';
import type { BidFundingIntent, Prisma } from '../generated/prisma/client';
import { BID_LUA } from './bid-lua';
import { persistAcceptedBids } from './bid-persistence';

type BidIdentity = { userId: string; sessionId: string };
type LiveLot = AuctionState & {
  open: boolean;
  groupId: string | null;
  feeVersion: string;
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
  readonly prefix: string;
  private readonly redis;
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
  }
  async start() {
    if (!this.enabled) return;
    if (this.started) {
      this.available();
      return;
    }
    try {
      await this.redis.connect();
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
      this.scriptSha = await this.redis.scriptLoad(BID_LUA);
      this.ready = true;
      this.started = true;
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
      select: { id: true, startPriceKobo: true, endAt: true },
    });
    for (const lot of rows)
      await this.redis.set(
        `${this.prefix}lot:${lot.id}`,
        JSON.stringify({
          open: true,
          startPriceKobo: fromLedgerKobo(lot.startPriceKobo),
          currentPriceKobo: null,
          leader: null,
          groupId: null,
          endsAt: lot.endAt.getTime(),
          feeVersion: BID_FEE_VERSION,
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
      if (!state.open || state.endsAt <= Date.now())
        throw new ConflictException('This lot has closed.');
      return state;
    }
    if (lot.endAt.getTime() <= Date.now())
      throw new ConflictException('This lot has closed.');
    await this.redis.set(
      `${this.prefix}lot:${lotId}`,
      JSON.stringify({
        open: true,
        startPriceKobo: fromLedgerKobo(lot.startPriceKobo),
        currentPriceKobo: null,
        leader: null,
        groupId: null,
        endsAt: lot.endAt.getTime(),
        feeVersion: BID_FEE_VERSION,
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
        sessionId: intent.sessionId,
        maxKobo: fromLedgerKobo(intent.maxKobo),
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
            session.user.role !== 'buyer' ||
            session.user.status !== 'active' ||
            !session.user.phoneVerifiedAt ||
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
          const total = estimatedTotal(input.maxKobo);
          const delta =
            total - (baseMax === undefined ? 0 : estimatedTotal(baseMax));
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
              totalKobo: BigInt(total),
              reservedKobo: BigInt(delta),
              baseMaxKobo: baseMax === undefined ? null : BigInt(baseMax),
              feeVersion: BID_FEE_VERSION,
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
            session.user.status !== 'active' ||
            session.user.role !== 'buyer' ||
            !session.user.phoneVerifiedAt
          )
            throw new ForbiddenException();
          const intent = await tx.bidFundingIntent.findUniqueOrThrow({
            where: { id: dto.preparationId },
          });
          if (intent.status !== 'released') await this.publishProof(intent);
        });
        return dto;
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
        await this.ledger.db.bidFundingIntent.update({
          where: { id: intent.id },
          data: { status: 'retained' },
        });
      return;
    }
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
  async fenceEligibility(tx: Prisma.TransactionClient, userId: string) {
    await tx.$queryRaw`SELECT id FROM users WHERE id=${userId}::uuid FOR UPDATE`;
    const sessions = await tx.authSession.findMany({
      where: { userId, revokedAt: null },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    for (const session of sessions)
      await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${session.id}::uuid FOR UPDATE`;
    await this.revokeSessions(sessions.map((session) => session.id));
    await tx.$executeRaw`SELECT set_config('auction_ng.bid_fenced','on',true)`;
  }
  async maintain() {
    this.available();
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
    for (const intent of rows) {
      // Missing proof is recreated only from a durable funded intent in this same Redis process.
      await this.publishProof(intent);
      await this.command('expire', intent.id, intent.binding, intent.lotId);
      await this.releaseIfTerminal(intent);
      this.cursor = intent.id;
    }
    return { checked: rows.length };
  }
  async persist(streamIds: string[]) {
    this.available();
    return persistAcceptedBids(this.ledger, this.redis, this.prefix, streamIds);
  }
}
