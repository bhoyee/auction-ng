import { createHash, randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { createClient } from 'redis';
import { z } from 'zod';
import {
  acceptedBidEventSchema,
  persistBidsSchema,
  fromLedgerKobo,
  bidModeSchema,
} from '@auction-ng/shared';
import type { LedgerService } from '../ledger/ledger-service';
import type { Prisma } from '../generated/prisma/client';

const fingerprint = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function persistAcceptedBids(
  ledger: LedgerService,
  redis: ReturnType<typeof createClient>,
  namespace: string,
  streamIds: string[],
  transaction?: Prisma.TransactionClient,
) {
  persistBidsSchema.parse({ streamIds });
  if (!streamIds.length) return { namespace, persisted: [] as string[] };
  const events = await Promise.all(
    streamIds.map(async (streamId) => {
      const entry = (
        await redis.xRange(`${namespace}accepted`, streamId, streamId)
      )[0];
      if (!entry || entry.id !== streamId)
        throw new ConflictException('Accepted event unavailable.');
      const message = z
        .object({
          intentId: z.uuid(),
          lotId: z.uuid(),
          userId: z.uuid(),
          maxKobo: z.string().regex(/^[1-9]\d{0,15}$/),
          mode: bidModeSchema.optional(),
          result: z.string().max(10000),
        })
        .strict()
        .parse(entry.message);
      const result = acceptedBidEventSchema.parse(JSON.parse(message.result));
      const rawProof = await redis.get(`${namespace}proof:${message.intentId}`);
      if (!rawProof) throw new ConflictException('Funded outcome unavailable.');
      const proof = z
        .object({
          userId: z.uuid(),
          lotId: z.uuid(),
          maxKobo: z.number().int().safe(),
          binding: z.string(),
          status: z.literal('accepted'),
          mode: bidModeSchema.optional(),
          result: z.object({ streamId: z.string() }).passthrough(),
        })
        .passthrough()
        .parse(JSON.parse(rawProof));
      const { streamId: proofStream, ...cached } = proof.result;
      const cachedResult = acceptedBidEventSchema.parse(cached);
      const canonical = (r: typeof result) => [
        r.status,
        r.mode,
        r.isLeader,
        r.serverTime,
        r.state.startPriceKobo,
        r.state.currentPriceKobo,
        r.state.leader.bidderId,
        r.state.leader.maxKobo,
        r.state.endsAt,
      ];
      if (
        proofStream !== streamId ||
        fingerprint(canonical(result)) !==
          fingerprint(canonical(cachedResult)) ||
        proof.userId !== message.userId ||
        proof.lotId !== message.lotId ||
        String(proof.maxKobo) !== message.maxKobo ||
        (message.mode ?? 'automatic') !== result.mode ||
        (proof.mode ?? 'automatic') !== result.mode ||
        result.isLeader !== (result.state.leader.bidderId === message.userId) ||
        result.state.currentPriceKobo < result.state.startPriceKobo ||
        result.state.currentPriceKobo > result.state.leader.maxKobo ||
        result.state.endsAt <= result.serverTime
      )
        throw new ConflictException(
          'Accepted outcome does not match funded proof.',
        );
      return {
        streamId,
        message,
        result,
        proof,
        fingerprint: fingerprint([
          namespace,
          streamId,
          message.intentId,
          message.lotId,
          message.userId,
          message.maxKobo,
          ...canonical(result),
        ]),
      };
    }),
  );
  const run = async (tx: Prisma.TransactionClient) => {
    // Serialize replays in this namespace; never overwrite a conflicting receipt.
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${namespace},0))`;
    const intents = await tx.bidFundingIntent.findMany({
      where: { id: { in: events.map((e) => e.message.intentId) } },
    });
    for (const event of events) {
      const { message, result } = event;
      const intent = intents.find((i) => i.id === message.intentId);
      if (
        !intent ||
        intent.namespace !== namespace ||
        intent.userId !== message.userId ||
        intent.lotId !== message.lotId ||
        fromLedgerKobo(intent.maxKobo) !== event.proof.maxKobo ||
        intent.binding !== event.proof.binding ||
        intent.mode !== result.mode
      )
        throw new ConflictException(
          'Funding contract does not match accepted event.',
        );
      const scopedStream = `${fingerprint(namespace).slice(0, 32)}:${event.streamId}`;
      const timestamp = new Date(result.serverTime);
      const request = {
        lotId: intent.lotId,
        userId: intent.userId,
        amountKobo: BigInt(
          Math.min(event.proof.maxKobo, result.state.currentPriceKobo),
        ),
        maxKobo: intent.maxKobo,
        isProxy: result.mode === 'automatic',
        role: 'request',
        acceptanceId: intent.id,
        idempotencyKey: `bid:${intent.id}:request`,
        streamId: `${scopedStream}:r`,
        createdAt: timestamp,
      };
      const expected = [request];
      if (!result.isLeader)
        expected.push({
          ...request,
          userId: result.state.leader.bidderId,
          amountKobo: BigInt(result.state.currentPriceKobo),
          maxKobo: BigInt(result.state.leader.maxKobo),
          isProxy: true,
          role: 'counter',
          idempotencyKey: `bid:${intent.id}:counter`,
          streamId: `${scopedStream}:c`,
        });
      const previous = await tx.bidAcceptance.findUnique({
        where: { id: intent.id },
        include: { bids: true },
      });
      if (previous) {
        if (
          previous.fingerprint !== event.fingerprint ||
          previous.bids.length !== expected.length ||
          expected.some(
            (row) =>
              !previous.bids.some((saved) =>
                Object.entries(row).every(([key, value]) => {
                  const actual = saved[key as keyof typeof saved];
                  return value instanceof Date
                    ? actual instanceof Date &&
                        actual.getTime() === value.getTime()
                    : actual === value;
                }),
              ),
          )
        )
          throw new ConflictException('Persisted bid receipt conflicts.');
      } else {
        await tx.bidAcceptance.create({
          data: {
            id: intent.id,
            namespace,
            streamId: event.streamId,
            fingerprint: event.fingerprint,
            result,
            createdAt: timestamp,
          },
        });
        await tx.bid.createMany({
          data: expected.map((row) => ({
            ...row,
            id: row.role === 'request' ? intent.id : randomUUID(),
          })),
        });
      }
    }
  };
  if (transaction) await run(transaction);
  else await ledger.db.$transaction(run, { maxWait: 60000, timeout: 15000 });
  return { namespace, persisted: streamIds };
}
