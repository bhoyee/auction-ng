import {
  BadRequestException,
  ServiceUnavailableException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { createClient } from 'redis';
import { z } from 'zod';
import * as s from '@auction-ng/shared';
import { StaffAdminService } from './staff-admin-service';
import { BidService } from '../bids/bid-service';
import type { AuthIdentity } from '../auth/auth-service';
import { LiveBidProjection } from './live-bid-projection';
import { LiveSnapshotStore } from './live-snapshot-store';
import { encryptPii } from '../security/pii';
import { AuctionPauseService } from '../bids/auction-pause-service';
import { LiveIssues } from './live-issues';

const metadataSelect = {
  id: true,
  lotNumber: true,
  title: true,
  categoryId: true,
  locationId: true,
  category: { select: { name: true } },
  location: { select: { name: true } },
  startPriceKobo: true,
  originalRunTimeMs: true,
  endAt: true,
  startAt: true,
  images: {
    orderBy: { sortOrder: 'asc' as const },
    take: 1,
    select: { thumbnailUrl: true },
  },
  _count: { select: { watchlist: true } },
} as const;
type Metadata = Awaited<ReturnType<LiveMonitorService['metadata']>>;
type Closed = {
  id: string;
  reference: string;
  title: string;
  winner: string | null;
  hammer: bigint | null;
  closedAt: Date;
  paid: boolean;
  late: boolean;
};
const cursorSchema = z
  .object({ end: z.number().int().safe(), id: z.uuid() })
  .strict();
export class LiveMonitorService {
  private readonly redis;
  private readonly metrics;
  private readonly prefix;
  private readonly snapshots;
  private readonly pause;
  private cached: { at: number; value: Metadata } | null = null;
  private refreshing: Promise<{ status: 'completed' | 'busy' }> | null = null;
  private connecting: Promise<unknown> | null = null;
  constructor(
    private readonly staff: StaffAdminService,
    private readonly bids: BidService,
    redisUrl = process.env.REDIS_URL,
  ) {
    this.prefix = s.liveMonitorPrefix(bids.prefix);
    this.redis = createClient({
      url: redisUrl,
      disableOfflineQueue: true,
      commandOptions: { timeout: 5000 },
      socket: { reconnectStrategy: false, connectTimeout: 5000 },
    });
    this.redis.on('error', () => {});
    this.metrics = new LiveBidProjection(this.redis, bids.prefix);
    this.snapshots = new LiveSnapshotStore(this.redis, this.prefix);
    this.pause = new AuctionPauseService(staff.ledger, bids);
  }
  async onModuleDestroy() {
    if (this.redis.isOpen) this.redis.destroy();
  }
  private async connect() {
    if (this.redis.isReady) return;
    if (!this.connecting)
      this.connecting = this.redis.connect().finally(() => {
        this.connecting = null;
      });
    await this.connecting;
  }
  async metadata() {
    return this.staff.ledger.db.lot.findMany({
      where: {
        status: { in: ['open', 'closing'] },
        archivedAt: null,
        startAt: { lte: new Date() },
      },
      select: metadataSelect,
    });
  }
  async refresh() {
    if (this.refreshing) return { status: 'busy' as const };
    const work = this.produce();
    this.refreshing = work;
    try {
      return await work;
    } finally {
      this.refreshing = null;
    }
  }
  private async produce() {
    await this.connect();
    await this.pause.advance();
    // Bidding's readiness check protects the reader from unreconciled Redis.
    const clock = await this.bids.monitorBooks([]);
    const now = Date.parse(clock.serverTime),
      dayStart = new Date(
        Math.floor((now + 3600000) / 86400000) * 86400000 - 3600000,
      );
    const pause = await this.bids.auctionPauseState();
    // Catch up in bounded batches; do not publish partial history as measured zero.
    let caughtUp = false;
    for (let i = 0; i < 200; i++) {
      const result = await this.metrics.refresh();
      if (result.status === 'idle') {
        caughtUp = true;
        break;
      }
    }
    if (!caughtUp)
      throw new ServiceUnavailableException('Live metrics are catching up.');
    if (!this.cached || now - this.cached.at >= 5000)
      this.cached = { at: now, value: await this.metadata() };
    const metadata = this.cached.value;
    let rows: s.MonitorLot[] = [];
    const leaderIds = new Map<string, string>();
    for (let offset = 0; offset < metadata.length; offset += 200) {
      const batch = metadata.slice(offset, offset + 200),
        ids = batch.map((row) => row.id);
      const [books, counts] = await Promise.all([
        this.bids.monitorBooks(ids),
        this.metrics.lots(ids),
      ]);
      batch.forEach((row, index) => {
        const book = books.states[index],
          count = counts[index];
        if (book?.leader) leaderIds.set(row.id, book.leader.bidderId);
        rows.push(
          s.monitorLotSchema.parse({
            id: row.id,
            reference: row.lotNumber,
            title: row.title,
            thumbnail: row.images[0]?.thumbnailUrl ?? null,
            categoryId: row.categoryId,
            category: row.category.name,
            locationId: row.locationId,
            location: row.location.name,
            runTimeMs:
              row.originalRunTimeMs === null
                ? null
                : Number(row.originalRunTimeMs),
            endsAt: book
              ? new Date(book.endsAt).toISOString()
              : row.endAt.toISOString(),
            currentPriceKobo: book
              ? (book.currentPriceKobo ?? book.startPriceKobo)
              : null,
            bidCount: count?.bidCount ?? 0,
            watchers: row._count.watchlist,
            extensions: count?.extensions ?? 0,
            leading: null,
            area: null,
            paused: pause.phase !== 'live',
            remainingMs:
              pause.phase !== 'live' && pause.pausedAt !== undefined
                ? Math.max(
                    0,
                    (book?.pauseId === pause.pauseId
                      ? (book?.pauseEndsAt ??
                        book?.endsAt ??
                        row.endAt.getTime())
                      : (book?.endsAt ?? row.endAt.getTime())) -
                      Math.max(pause.pausedAt, row.startAt.getTime()),
                  )
                : null,
            revision: book?.streamId ?? '0-0',
            streamId: book?.streamId ?? '0-0',
            serverTime: books.serverTime,
          }),
        );
      });
    }
    const people = leaderIds.size
      ? await this.staff.ledger.db.user.findMany({
          where: { id: { in: [...new Set(leaderIds.values())] } },
          select: { id: true, name: true },
        })
      : [];
    const names = new Map(
      people.map((person) => [person.id, s.maskMonitorName(person.name ?? '')]),
    );
    for (const row of rows)
      row.leading = names.get(leaderIds.get(row.id) ?? '') ?? null;
    const closed = await this.staff.ledger.db.$queryRaw<Closed[]>`
      SELECT l.id,l.lot_number AS reference,l.title,u.name AS winner,s.hammer_kobo AS hammer,s.closed_at AS "closedAt",
        (i.status IN ('paid','refunded')) AS paid,(s.closed_at>s.end_at+interval '2 seconds') AS late
      FROM lot_settlements s JOIN lots l ON l.id=s.lot_id LEFT JOIN users u ON u.id=s.winner_id LEFT JOIN invoices i ON i.id=s.invoice_id
      WHERE s.namespace=${this.bids.prefix} AND s.closed_at>=${dayStart} AND s.closed_at<=${new Date(now)}
      UNION ALL
      SELECT l.id,l.lot_number,l.title,u.name,p.price_kobo,i.created_at,true,false
      FROM purchases p JOIN lots l ON l.id=p.lot_id JOIN users u ON u.id=p.user_id JOIN invoices i ON i.id=p.invoice_id
      WHERE p.namespace=${this.bids.prefix} AND p.status='paid' AND i.created_at>=${dayStart} AND i.created_at<=${new Date(now)}
      AND NOT EXISTS (SELECT 1 FROM lot_settlements s WHERE s.lot_id=p.lot_id)
      ORDER BY "closedAt" DESC,id DESC`;
    const closedRows = [];
    for (let offset = 0; offset < closed.length; offset += 200) {
      const batch = closed.slice(offset, offset + 200),
        counts = await this.metrics.lots(batch.map((row) => row.id));
      closedRows.push(
        ...batch.map((row, index) =>
          s.monitorClosedRowSchema.parse({
            id: row.id,
            reference: row.reference,
            title: row.title,
            winner: row.winner ? s.maskMonitorName(row.winner) : null,
            bidCount: counts[index]?.bidCount ?? 0,
            status: row.winner
              ? row.paid
                ? 'sold'
                : 'payment_pending'
              : 'unsold',
            hammerKobo:
              row.hammer === null ? null : s.fromLedgerKobo(row.hammer),
            closedAt: row.closedAt.toISOString(),
          }),
        ),
      );
    }
    const confirmedClosed = new Set(closed.map((row) => row.id));
    rows = rows.filter((row) => !confirmedClosed.has(row.id));
    const stats = await this.metrics.read(now);
    const presence = await readLivePresence(this.redis, this.bids.prefix, now);
    const stamp = clock.serverTime;
    await this.redis.set(this.prefix + 'observed-since', stamp, { NX: true });
    const observedSince = await this.redis.get(this.prefix + 'observed-since');
    const summary = s.monitorSummarySchema.parse({
      serverTime: stamp,
      revision: now,
      observedSince,
      paused: pause.phase !== 'live',
      phase: pause.phase,
      controlRevision: `${pause.phase}:${pause.phase === 'live' ? (pause.resumeId ?? 'initial') : (pause.pauseId ?? 'initial')}`,
      liveCount: rows.length,
      closing15Count: rows.filter(
        (row) =>
          Date.parse(row.endsAt) > now &&
          Date.parse(row.endsAt) <= now + 900000,
      ).length,
      endingHourCount: rows.filter(
        (row) =>
          Date.parse(row.endsAt) > now &&
          Date.parse(row.endsAt) <= now + 3600000,
      ).length,
      endedTodayCount: closed.length,
      soldTodayCount: closed.filter((row) => row.paid).length,
      gmvTodayKobo: s.fromLedgerKobo(
        closed.reduce((sum, row) => sum + (row.hammer ?? 0n), 0n),
      ),
      bidsPerMinute: stats.bidsPerMinute,
      bidsPeak: stats.bidsPeak,
      bidsPeakAt: stats.bidsPeakAt,
      onlineBuyers: presence?.online ?? null,
      onlineBidBuyers: presence?.haveBid ?? null,
      extensionCount: stats.extensionCount,
      extendedLotCount: stats.extendedLotCount,
    });
    const measured = await new LiveIssues(this.redis, this.bids.prefix).read(
      now,
    );
    const unknown =
      'Issue tracking is unavailable. No zero is assumed; tracking resumes when the bid service is healthy.';
    const late = closed.filter((row) => row.late).length;
    const issues = s.monitorIssuesSchema.parse({
      serverTime: stamp,
      observedSince: dayStart.toISOString(),
      items: [
        {
          kind: 'wallet',
          label: 'Bids rejected for low wallet balance',
          context: measured
            ? `Confirmed bid-preparation rejections today (WAT), once per request, tracked since ${measured.since}. Only requests reaching the server count.`
            : unknown,
          count: measured?.wallet ?? null,
          tone: 'warning',
        },
        {
          kind: 'release',
          label: 'Bid holds with release errors',
          context: measured
            ? `Distinct bid holds with a failed ledger release today (WAT), tracked since ${measured.since}. Includes subsequently recovered errors; retries do not inflate the count.`
            : unknown,
          count: measured?.release ?? null,
          tone: measured?.release ? 'danger' : 'info',
        },
        {
          kind: 'connections',
          label: 'Connections dropped and recovered',
          context: presence
            ? `Today's authenticated buyer reconnections within five seconds (WAT). Tracking since ${presence.observedSince}; intentional disconnects excluded.`
            : 'Connection telemetry is unavailable.',
          count: presence?.recovered ?? null,
          tone: 'info',
        },
        {
          kind: 'late',
          label: 'Lots closed late > 2 s',
          context: 'Confirmed settlements since midnight WAT.',
          count: late,
          tone: late ? 'danger' : 'success',
        },
      ],
    });
    await this.snapshots.save({
      rows,
      closed: closedRows,
      clock: { revision: now, serverTime: stamp },
      values: {
        summary,
        series: s.monitorSeriesSchema.parse({
          serverTime: stamp,
          points: stats.points,
        }),
        issues,
        filters: {
          locations: [
            ...new Map(
              rows.map((row) => [
                row.locationId,
                { id: row.locationId, name: row.location },
              ]),
            ).values(),
          ].sort((a, b) => a.name.localeCompare(b.name)),
          categories: [
            ...new Map(
              rows.map((row) => [
                row.categoryId,
                { id: row.categoryId, name: row.category },
              ]),
            ).values(),
          ].sort((a, b) => a.name.localeCompare(b.name)),
        },
      },
    });
    return { status: 'completed' as const };
  }
  async read(
    who: AuthIdentity,
    part: 'summary' | 'lots' | 'series' | 'issues' | 'closed' | 'filters',
    input: unknown,
  ) {
    const query = s.liveMonitorQuerySchema.parse(input);
    await this.staff.ledger.db.$transaction((tx) =>
      this.staff.actor(tx, who, 'auctions.manage'),
    );
    await this.connect();
    const marker = await this.redis.get(this.prefix + 'live_auction_stats');
    if (!marker)
      throw new ServiceUnavailableException('Live monitor is reconnecting.');
    const clock = s.monitorSignalSchema.parse(JSON.parse(marker));
    const key = this.prefix + 'current';
    const summary = s.monitorSummarySchema.parse({
      ...JSON.parse((await this.redis.get(key + ':summary')) ?? 'null'),
      ...clock,
    });
    if (part === 'summary') return summary;
    if (part === 'lots') {
      let anchor: z.infer<typeof cursorSchema> | null = null;
      if (query.cursor) {
        try {
          anchor = cursorSchema.parse(
            JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')),
          );
        } catch {
          throw new BadRequestException('Invalid auction page.');
        }
      }
      // Sorted-set seek plus hash batches; no bid/ledger database reads on this path.
      const ids = await this.redis.zRangeByScore(
        key +
          ':order:' +
          (query.categoryId ?? 'all') +
          ':' +
          (query.locationId ?? 'all'),
        anchor?.end ?? '-inf',
        '+inf',
      );
      const items: s.MonitorLot[] = [];
      for (
        let offset = 0;
        offset < ids.length && items.length <= query.limit;
        offset += 200
      ) {
        const values = await this.redis.hmGet(
          key + ':rows',
          ids.slice(offset, offset + 200),
        );
        for (const raw of values) {
          if (!raw) continue;
          const row = s.monitorLotSchema.parse({
            ...JSON.parse(raw),
            serverTime: summary.serverTime,
          });
          if (
            anchor &&
            Date.parse(row.endsAt) === anchor.end &&
            row.id <= anchor.id
          )
            continue;
          if (
            (query.categoryId && row.categoryId !== query.categoryId) ||
            (query.locationId && row.locationId !== query.locationId)
          )
            continue;
          items.push(row);
          if (items.length > query.limit) break;
        }
      }
      const page = items.slice(0, query.limit),
        last = page.at(-1);
      return s.monitorLotsSchema.parse({
        items: page,
        nextCursor:
          items.length > query.limit && last
            ? Buffer.from(
                JSON.stringify({ end: Date.parse(last.endsAt), id: last.id }),
              ).toString('base64url')
            : null,
        serverTime: summary.serverTime,
        revision: summary.revision,
      });
    }
    if (part === 'closed') {
      const rank = query.cursor
        ? await this.redis.zRevRank(key + ':closed-order', query.cursor)
        : null;
      if (query.cursor && rank === null)
        throw new BadRequestException('Closed auction page expired.');
      const offset = rank === null ? 0 : rank + 1;
      const [ids, total] = await Promise.all([
        this.redis.zRange(key + ':closed-order', offset, offset + query.limit, {
          REV: true,
        }),
        this.redis.zCard(key + ':closed-order'),
      ]);
      const page = ids.slice(0, query.limit),
        values = page.length
          ? await this.redis.hmGet(key + ':closed-rows', page)
          : [];
      return s.monitorClosedSchema.parse({
        items: values
          .filter((v): v is string => v !== null)
          .map((raw) => s.monitorClosedRowSchema.parse(JSON.parse(raw))),
        totalToday: total,
        nextCursor: ids.length > query.limit ? page.at(-1) : null,
        serverTime: summary.serverTime,
      });
    }
    const source = JSON.parse(
      (await this.redis.get(key + ':' + part)) ?? 'null',
    ) as unknown;
    const raw =
      source && typeof source === 'object' && !Array.isArray(source)
        ? { ...source, serverTime: summary.serverTime }
        : source;
    if (part === 'series') return s.monitorSeriesSchema.parse(raw);
    if (part === 'issues') return s.monitorIssuesSchema.parse(raw);
    if (part === 'filters') return s.monitorFiltersSchema.parse(source);
  }
  async recordHistory(who: AuthIdentity, input: unknown) {
    const value = s.monitorCommandSchema.parse(input);
    if (value.operation !== 'history' || !value.lotId)
      throw new BadRequestException('Choose a lot to inspect.');
    const lotId = value.lotId;
    return this.staff.mutation(
      who,
      { idempotencyKey: value.idempotencyKey, reason: value.reason, id: lotId },
      'bids.read',
      'live_history_opened',
      async (tx) => {
        const lot = await tx.lot.findUnique({
          where: { id: lotId },
          select: { id: true },
        });
        if (!lot) throw new BadRequestException('This lot is unavailable.');
        return { id: lot.id, message: 'Bid history inspection recorded.' };
      },
      (tx, id) =>
        tx.lot.findUnique({
          where: { id },
          select: { id: true, title: true, status: true, endAt: true },
        }),
    );
  }
  async messageBidders(who: AuthIdentity, input: unknown) {
    const value = s.monitorCommandSchema.parse(input);
    if (value.operation !== 'message' || !value.lotId || !value.message)
      throw new BadRequestException('Choose an item and enter the message.');
    // Check access before draining any accepted events; never reveal buyer identities.
    await this.staff.ledger.db.$transaction((tx) =>
      this.staff.actor(tx, who, 'auctions.manage'),
    );
    const cutoff = await this.bids.persistedBidCutoff();
    const lotId = value.lotId,
      message = value.message;
    return this.staff.mutation(
      who,
      { ...value, id: lotId },
      'auctions.manage',
      'lot_bidders_messaged',
      async (tx) => {
        const lot = await tx.lot.findUnique({
          where: { id: lotId },
          select: { id: true, archivedAt: true },
        });
        if (!lot || lot.archivedAt)
          throw new BadRequestException('This item is unavailable.');
        await tx.lotBidderMessage.create({
          data: {
            id: value.idempotencyKey,
            lotId,
            actorId: who.user.id,
            cutoffAt: cutoff,
            messageCiphertext: encryptPii(message, 'lot-message'),
          },
        });
        return {
          id: value.idempotencyKey,
          message:
            'Message queued for buyers who bid on this item. In-app, email and enabled phone alerts will follow.',
        };
      },
      (tx) =>
        tx.lotBidderMessage.findUnique({
          where: { id: value.idempotencyKey },
          select: {
            id: true,
            lotId: true,
            recipientCount: true,
            completedAt: true,
          },
        }),
    );
  }
  async controlBidding(who: AuthIdentity, input: unknown) {
    const value = s.monitorCommandSchema.parse(input);
    if (!['pause_all', 'resume_all'].includes(value.operation))
      throw new BadRequestException('Choose pause or resume all bidding.');
    const confirmation = value.operation === 'pause_all' ? 'PAUSE' : 'RESUME';
    if (value.confirmation !== confirmation)
      throw new BadRequestException(`Type ${confirmation} to confirm.`);
    const result = await this.staff.mutation(
      who,
      value,
      'auctions.manage',
      'auction_' + value.operation,
      async (tx) => {
        const access = await this.staff.actor(tx, who, 'auctions.manage');
        if (access.user.role !== 'admin')
          throw new ForbiddenException(
            'Only an administrator may control all bidding.',
          );
        if (
          await tx.auctionPauseCommand.findFirst({
            where: {
              namespace: this.bids.prefix,
              status: { not: 'completed' },
            },
          })
        )
          throw new ConflictException(
            'A previous pause or resume is still being completed.',
          );
        const state = await this.bids.auctionPauseState();
        const revision = `${state.phase}:${state.phase === 'live' ? (state.resumeId ?? 'initial') : (state.pauseId ?? 'initial')}`;
        if (value.expectedRevision !== revision)
          throw new ConflictException(
            'The global bidding status changed. Close this dialog and review its current status.',
          );
        if (
          (value.operation === 'pause_all' && state.phase !== 'live') ||
          (value.operation === 'resume_all' && state.phase !== 'paused')
        )
          throw new ConflictException(
            'Bidding status changed. Wait for the live status before retrying.',
          );
        await tx.auctionPauseCommand.create({
          data: {
            id: value.idempotencyKey,
            namespace: this.bids.prefix,
            actorId: who.user.id,
            operation: value.operation,
          },
        });
        return {
          id: value.idempotencyKey,
          message:
            value.operation === 'pause_all'
              ? 'Pause requested. Watch the live status for confirmation.'
              : 'Resume requested. Bidding stays paused until all countdowns and schedules have been restored.',
        };
      },
      (tx) =>
        tx.auctionPauseCommand.findUnique({
          where: { id: value.idempotencyKey },
          select: { id: true, operation: true, status: true },
        }),
    );
    await this.pause.advance();
    return result;
  }
}
import { readLivePresence } from './live-presence-reader';
