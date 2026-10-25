import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  catalogueRules,
  imageRules,
  searchRules,
  type SearchQuery,
} from '@auction-ng/shared';
import { Prisma } from '../generated/prisma/client';
import { CatalogueService } from '../catalogue/catalogue-service';
import type { SearchDocument, SearchEngine } from './meilisearch-engine';

const cursorSchema = z
  .object({
    id: z.uuid(),
    endAtMs: z.number().int().safe().nonnegative(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export class SearchService {
  constructor(
    private readonly catalogue: CatalogueService,
    private readonly engine?: SearchEngine,
  ) {}
  async search(input: SearchQuery) {
    const engine = this.engine;
    if (!engine)
      throw new ServiceUnavailableException('Search is not configured.');
    const now = new Date();
    const q = input.q.normalize('NFC');
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify([
          q,
          input.categoryId ?? null,
          input.locationId ?? null,
          input.endingSoon ?? false,
          input.minPriceKobo ?? null,
          input.maxPriceKobo ?? null,
        ]),
      )
      .digest('hex');
    let cursor: z.infer<typeof cursorSchema> | undefined;
    if (input.cursor) {
      try {
        cursor = cursorSchema.parse(
          JSON.parse(Buffer.from(input.cursor, 'base64url').toString()),
        );
        if (cursor.fingerprint !== fingerprint) throw new Error();
      } catch {
        throw new BadRequestException(
          'Use the search cursor with the same query and filters.',
        );
      }
    }
    const filters = [`endAtMs > ${now.getTime()}`];
    if (input.categoryId)
      filters.push(`categoryId = ${JSON.stringify(input.categoryId)}`);
    if (input.locationId)
      filters.push(`locationId = ${JSON.stringify(input.locationId)}`);
    if (input.minPriceKobo !== undefined)
      filters.push(`startPriceKobo >= ${input.minPriceKobo}`);
    if (input.maxPriceKobo !== undefined)
      filters.push(`startPriceKobo <= ${input.maxPriceKobo}`);
    if (input.endingSoon)
      filters.push(`endAtMs <= ${now.getTime() + imageRules.endingSoonMs}`);
    if (cursor)
      filters.push(
        `(endAtMs > ${cursor.endAtMs} OR (endAtMs = ${cursor.endAtMs} AND id > ${JSON.stringify(cursor.id)}))`,
      );
    const hits = await engine.find(q, filters, input.limit + 1);
    const consumed = hits.slice(0, input.limit);
    const last = consumed.at(-1);
    const items = await this.catalogue.searchMatches(
      consumed.map((hit) => hit.id),
      input,
      now,
    );
    return {
      items,
      nextCursor:
        hits.length > input.limit && last
          ? Buffer.from(JSON.stringify({ ...last, fingerprint })).toString(
              'base64url',
            )
          : null,
      serverTime: now.toISOString(),
    };
  }
  async sync() {
    const engine = this.engine;
    if (!engine)
      throw new ServiceUnavailableException('Search is not configured.');
    return this.catalogue.db.$transaction(
      async (tx) => {
        const locks = await tx.$queryRaw<
          { locked: boolean }[]
        >`SELECT pg_try_advisory_xact_lock(808) AS locked`;
        if (!locks[0]?.locked) return { processed: 0, busy: true };
        await engine.initialize();
        const jobs = await tx.$queryRaw<
          { lotId: string; version: bigint }[]
        >`SELECT lot_id AS "lotId",version FROM search_index_jobs WHERE version > applied_version ORDER BY version LIMIT ${searchRules.batchSize}`;
        if (!jobs.length) return { processed: 0, busy: false };
        const lots = await tx.lot.findMany({
          where: { id: { in: jobs.map((job) => job.lotId) } },
          select: {
            id: true,
            lotNumber: true,
            title: true,
            description: true,
            categoryId: true,
            locationId: true,
            startPriceKobo: true,
            endAt: true,
            status: true,
          },
        });
        const documents: SearchDocument[] = [];
        const removed: string[] = [];
        for (const lot of lots) {
          if (
            catalogueRules.endingSoonStatuses.some(
              (status) => status === lot.status,
            ) &&
            lot.endAt.getTime() > Date.now()
          )
            documents.push({
              id: lot.id,
              lotNumber: lot.lotNumber,
              title: lot.title,
              description: lot.description,
              categoryId: lot.categoryId,
              locationId: lot.locationId,
              startPriceKobo: Number(lot.startPriceKobo),
              endAtMs: lot.endAt.getTime(),
            });
          else removed.push(lot.id);
        }
        await engine.upsert(documents.sort((a, b) => a.id.localeCompare(b.id)));
        await engine.remove(removed.sort());
        // A lot may change while Meilisearch processes the batch. Only acknowledge
        // the version read above, leaving any newer committed version pending.
        const values = Prisma.join(
          jobs.map(
            (job) => Prisma.sql`(${job.lotId}::uuid,${job.version}::bigint)`,
          ),
        );
        await tx.$executeRaw(
          Prisma.sql`UPDATE search_index_jobs AS jobs SET applied_version=accepted.version FROM (VALUES ${values}) AS accepted(id,version) WHERE jobs.lot_id=accepted.id AND jobs.version=accepted.version`,
        );
        return { processed: jobs.length, busy: false };
      },
      { timeout: searchRules.syncTimeoutMs, maxWait: 5000 },
    );
  }
}
