import { ConflictException } from '@nestjs/common';
import { fromLedgerKobo } from '@auction-ng/shared';
import type { LedgerService } from '../ledger/ledger-service';
import type { BidService } from './bid-service';

/** Durable SQL intent precedes every Redis effect. The global fence stays closed
 * throughout resume, including after a crash between Redis and PostgreSQL writes. */
export class AuctionPauseService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly bids: BidService,
  ) {}
  async advance() {
    return this.ledger.db.$transaction(
      async (lock) => {
        const [lease] = await lock.$queryRaw<
          { locked: boolean }[]
        >`SELECT pg_try_advisory_xact_lock(hashtextextended(${this.bids.prefix},716)) AS locked`;
        if (!lease?.locked) return;
        const job = await this.ledger.db.auctionPauseCommand.findFirst({
          where: { namespace: this.bids.prefix, status: { not: 'completed' } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        if (!job) {
          const state = await this.bids.auctionPauseState();
          if (
            state.phase === 'resuming' &&
            state.resumeId &&
            state.finalizedAt
          ) {
            const completed =
              await this.ledger.db.auctionPauseCommand.findFirst({
                where: {
                  id: state.resumeId,
                  namespace: this.bids.prefix,
                  status: 'completed',
                },
              });
            if (completed)
              await this.bids.applyAuctionPause('resume_open', completed.id);
          }
          return;
        }
        if (job.operation === 'pause_all') {
          const state = await this.bids.applyAuctionPause('pause', job.id);
          if (state.pausedAt === undefined)
            throw new ConflictException('Pause timestamp missing.');
          await this.ledger.db.auctionPauseCommand.update({
            where: { id: job.id },
            data: {
              status: 'completed',
              pausedAt: BigInt(state.pausedAt),
              completedAt: new Date(),
            },
          });
          return;
        }
        if (
          await this.ledger.db.bidCancellationApproval.count({
            where: {
              namespace: this.bids.prefix,
              status: { in: ['pending', 'committed'] },
            },
          })
        )
          return;
        const state = await this.bids.applyAuctionPause('resume_begin', job.id);
        if (state.pausedAt === undefined || state.resumedAt === undefined)
          throw new ConflictException('Resume timestamps missing.');
        const duration = state.resumedAt - state.pausedAt;
        if (!Number.isSafeInteger(duration) || duration < 0)
          throw new ConflictException('Resume interval invalid.');
        await this.ledger.db.auctionPauseCommand.update({
          where: { id: job.id },
          data: {
            status: 'applying',
            pausedAt: BigInt(state.pausedAt),
            resumedAt: BigInt(state.resumedAt),
          },
        });
        const existing = await this.ledger.db.auctionResumeLot.findMany({
          where: { commandId: job.id, completedAt: null },
          orderBy: { lotId: 'asc' },
          take: 50,
        });
        if (existing.length) {
          for (const plan of existing) await this.apply(plan);
          return;
        }
        const lots = await this.ledger.db.lot.findMany({
          where: {
            status: { in: ['open', 'closing', 'scheduled'] },
            archivedAt: null,
            ...(job.cursorLotId ? { id: { gt: job.cursorLotId } } : {}),
          },
          orderBy: { id: 'asc' },
          take: 50,
        });
        if (!lots.length) {
          const final = await this.bids.applyAuctionPause(
            'resume_finish',
            job.id,
          );
          if (
            final.resumedAt === undefined ||
            final.finalAdditionMs === undefined
          )
            throw new ConflictException('Final resume timestamp missing.');
          const delta = BigInt(final.finalAdditionMs);
          const finalizedResumeTime = final.resumedAt;
          await this.ledger.db.$transaction(async (tx) => {
            const command = await tx.auctionPauseCommand.findUniqueOrThrow({
              where: { id: job.id },
            });
            if (command.status === 'completed') return;
            await tx.$executeRaw`UPDATE lots l SET updated_at=GREATEST(l.updated_at+interval '1 millisecond',now()),end_at=to_timestamp((r.new_end_at+${delta})::double precision/1000),start_at=CASE WHEN r.schedule_changed THEN to_timestamp((r.new_start_at+${delta})::double precision/1000) ELSE l.start_at END FROM auction_resume_lots r WHERE r.command_id=${job.id}::uuid AND r.lot_id=l.id AND r.pause_eligible=true AND l.status IN ('open','closing','scheduled')`;
            await tx.$executeRaw`UPDATE auction_resume_lots SET new_end_at=new_end_at+${delta},new_start_at=CASE WHEN schedule_changed THEN new_start_at+${delta} ELSE new_start_at END WHERE command_id=${job.id}::uuid AND pause_eligible=true`;
            await tx.auctionPauseCommand.update({
              where: { id: job.id },
              data: {
                status: 'completed',
                resumedAt: BigInt(finalizedResumeTime),
                completedAt: new Date(),
              },
            });
          });
          await this.bids.applyAuctionPause('resume_open', job.id);
          return;
        }
        const books = await this.bids.monitorBooks(lots.map((l) => l.id));
        for (let index = 0; index < lots.length; index++) {
          const lot = lots[index];
          if (!lot) continue;
          const book = books.states[index];
          const oldEnd = book?.endsAt ?? lot.endAt.getTime();
          const effectivePause =
            lot.status === 'scheduled' && !lot.preBidsLaunching
              ? state.pausedAt
              : Math.max(state.pausedAt, lot.startAt.getTime());
          const shift =
            oldEnd > state.pausedAt &&
            (book === null || book === undefined || book.open);
          const scheduled = lot.status === 'scheduled' && !lot.preBidsLaunching;
          const newStart = scheduled
            ? Math.max(lot.startAt.getTime(), state.pausedAt) + duration
            : null;
          const newEnd = shift
            ? oldEnd + Math.max(0, state.resumedAt - effectivePause)
            : oldEnd;
          if (!Number.isSafeInteger(newEnd) || newEnd > 8640000000000000)
            throw new ConflictException(
              'Resume deadline exceeds supported time.',
            );
          const plan = await this.ledger.db.auctionResumeLot.upsert({
            where: { commandId_lotId: { commandId: job.id, lotId: lot.id } },
            create: {
              commandId: job.id,
              lotId: lot.id,
              oldEndAt: BigInt(oldEnd),
              newEndAt: BigInt(newEnd),
              newStartAt: newStart === null ? null : BigInt(newStart),
              scheduleChanged: scheduled && shift,
              pauseEligible: shift,
            },
            update: {},
          });
          await this.apply(plan);
          await this.ledger.db.auctionPauseCommand.update({
            where: { id: job.id },
            data: { cursorLotId: lot.id },
          });
        }
      },
      { timeout: 120000, maxWait: 5000 },
    );
  }
  private async apply(
    plan: Awaited<
      ReturnType<LedgerService['db']['auctionResumeLot']['findUniqueOrThrow']>
    >,
  ) {
    let startsAt: Date | undefined;
    if (plan.scheduleChanged) {
      if (plan.newStartAt === null)
        throw new ConflictException('The restored launch time needs review.');
      startsAt = new Date(fromLedgerKobo(plan.newStartAt));
    }
    const outcome = await this.bids.applyResumeLot(
      plan.id,
      plan.lotId,
      fromLedgerKobo(plan.oldEndAt),
      fromLedgerKobo(plan.newEndAt),
    );
    await this.ledger.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM lots WHERE id=${plan.lotId}::uuid FOR UPDATE`;
      const current = await tx.auctionResumeLot.findUniqueOrThrow({
        where: { id: plan.id },
      });
      if (current.completedAt) return;
      const row = await tx.lot.findUniqueOrThrow({ where: { id: plan.lotId } });
      if (['open', 'closing', 'scheduled'].includes(row.status))
        await tx.lot.update({
          where: { id: row.id },
          data: {
            endAt: new Date(fromLedgerKobo(plan.newEndAt)),
            ...(startsAt
              ? {
                  startAt: startsAt,
                  scheduleVersion: { increment: 1 },
                }
              : {}),
          },
        });
      if (row.preBidsLaunching)
        await this.bids.resumePreBidIntents(
          tx,
          row.id,
          fromLedgerKobo(plan.newEndAt),
        );
      await tx.auctionResumeLot.update({
        where: { id: plan.id },
        data: { completedAt: new Date(), applied: outcome === 'applied' },
      });
    });
  }
}
