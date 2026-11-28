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
import type { CatalogueService } from '../catalogue/catalogue-service';

type Database = ReturnType<typeof createDatabase>;

/** Saved searches; see packages/shared/src/saved-search-schemas.ts. */
export class SavedSearchService {
  constructor(
    private readonly db: Database,
    readonly enabled = process.env.SAVED_SEARCHES_ENABLED === 'true',
    private readonly catalogue?: Pick<CatalogueService, 'searchMatches'>,
  ) {}

  private on() {
    if (!this.enabled) throw new NotFoundException();
  }

  async list(userId: string) {
    if (!this.enabled)
      return {
        enabled: false,
        limit: savedSearchRules.max,
        digest: false,
        items: [],
      };
    // Fixed three queries: searches, new-match counts, digest setting.
    const rows = await this.db.buyerSavedSearch.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: savedSearchRules.max,
    });
    const counts = await this.db.savedSearchMatch.groupBy({
      by: ['savedSearchId'],
      where: { userId, seenAt: null, lot: liveLot() },
      _count: { _all: true },
    });
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { savedSearchDigest: true },
    });
    const fresh = new Map(
      counts.map((row) => [row.savedSearchId, row._count._all]),
    );
    return {
      enabled: true,
      limit: savedSearchRules.max,
      digest: user?.savedSearchDigest ?? true,
      items: rows.map((row) => ({
        id: row.id,
        query: row.query,
        categoryId: row.categoryId,
        locationId: row.locationId,
        maxPriceKobo:
          row.maxPriceKobo === null ? null : Number(row.maxPriceKobo),
        instantEmail: row.instantEmail,
        newMatches: fresh.get(row.id) ?? 0,
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

  /** Turns "email me straight away" on or off for one saved search. */
  async update(userId: string, id: string, instantEmail: boolean) {
    this.on();
    const { count } = await this.db.buyerSavedSearch.updateMany({
      where: { id, userId },
      data: { instantEmail },
    });
    if (!count) throw new NotFoundException();
    return { id, instantEmail };
  }

  /** The daily digest email for all of the buyer's saved searches. */
  async settings(userId: string, digest: boolean) {
    this.on();
    await this.db.user.update({
      where: { id: userId },
      data: { savedSearchDigest: digest },
    });
    return { digest };
  }

  /** New matches on live items, for the account badge. */
  async summary(userId: string) {
    if (!this.enabled) return { newMatches: 0 };
    const newMatches = await this.db.savedSearchMatch.count({
      where: { userId, seenAt: null, lot: liveLot() },
    });
    return { newMatches };
  }

  /** Opening a saved search's deals clears its new-match count. */
  async viewed(userId: string, id: string) {
    this.on();
    const search = await this.db.buyerSavedSearch.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!search) throw new NotFoundException();
    await this.db.savedSearchMatch.updateMany({
      where: { savedSearchId: id, userId, seenAt: null },
      data: { seenAt: new Date() },
    });
    return { id, newMatches: 0 };
  }

  /** Live items from new matches, closing soonest first, for the homepage. */
  async newItems(userId: string, limit: number) {
    const now = new Date();
    if (!this.enabled || !this.catalogue)
      return { items: [], nextCursor: null, serverTime: now.toISOString() };
    const rows = await this.db.savedSearchMatch.findMany({
      where: { userId, seenAt: null, lot: liveLot(now) },
      orderBy: [{ lot: { endAt: 'asc' } }, { lotId: 'asc' }],
      take: limit,
      select: { lotId: true },
    });
    const items = await this.catalogue.searchMatches(
      rows.map((row) => row.lotId),
      { limit },
      now,
    );
    return { items, nextCursor: null, serverTime: now.toISOString() };
  }
}

function liveLot(now = new Date()) {
  return {
    status: 'open',
    archivedAt: null,
    deletedAt: null,
    endAt: { gt: now },
  };
}
