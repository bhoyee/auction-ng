import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  normaliseSearch,
  savedSearchKey,
  savedSearchRules,
  type SavedSearchInput,
} from '@auction-ng/shared';
import type { createDatabase } from '../database/client';

type Database = ReturnType<typeof createDatabase>;

/** Saved searches; see packages/shared/src/saved-search-schemas.ts. */
export class SavedSearchService {
  constructor(
    private readonly db: Database,
    readonly enabled = process.env.SAVED_SEARCHES_ENABLED === 'true',
  ) {}

  private on() {
    if (!this.enabled) throw new NotFoundException();
  }

  async list(userId: string) {
    if (!this.enabled)
      return { enabled: false, limit: savedSearchRules.max, items: [] };
    const rows = await this.db.buyerSavedSearch.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: savedSearchRules.max,
    });
    return {
      enabled: true,
      limit: savedSearchRules.max,
      items: rows.map((row) => ({
        id: row.id,
        query: row.query,
        categoryId: row.categoryId,
        locationId: row.locationId,
        maxPriceKobo:
          row.maxPriceKobo === null ? null : Number(row.maxPriceKobo),
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  /** Saving the same search again returns the existing one. */
  async save(userId: string, input: SavedSearchInput) {
    this.on();
    const query = normaliseSearch(input.query);
    if (!query) throw new BadRequestException('Check the request fields.');
    const value = { ...input, query };
    const filterKey = savedSearchKey(value);
    return this.db.$transaction(async (tx) => {
      // One writer per buyer, so two quick taps can't pass the limit together.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('buyer-saved-searches'), hashtext(${userId}))`;
      const existing = await tx.buyerSavedSearch.findUnique({
        where: { userId_filterKey: { userId, filterKey } },
        select: { id: true },
      });
      if (existing) return { id: existing.id, created: false };
      if (
        (await tx.buyerSavedSearch.count({ where: { userId } })) >=
        savedSearchRules.max
      )
        throw new ConflictException(
          `You have ${savedSearchRules.max} saved searches. Remove one to save another.`,
        );
      if (
        value.categoryId &&
        !(await tx.category.findUnique({
          where: { id: value.categoryId },
          select: { id: true },
        }))
      )
        throw new BadRequestException('Check the request fields.');
      if (
        value.locationId &&
        !(await tx.location.findUnique({
          where: { id: value.locationId },
          select: { id: true },
        }))
      )
        throw new BadRequestException('Check the request fields.');
      const row = await tx.buyerSavedSearch.create({
        data: {
          userId,
          query,
          categoryId: value.categoryId ?? null,
          locationId: value.locationId ?? null,
          maxPriceKobo:
            value.maxPriceKobo === undefined
              ? null
              : BigInt(value.maxPriceKobo),
          filterKey,
        },
        select: { id: true },
      });
      return { id: row.id, created: true };
    });
  }

  async remove(userId: string, id: string) {
    this.on();
    const { count } = await this.db.buyerSavedSearch.deleteMany({
      where: { id, userId },
    });
    if (!count) throw new NotFoundException();
    return { removed: true };
  }
}
