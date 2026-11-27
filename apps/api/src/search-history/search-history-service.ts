import {
  normaliseSearch,
  searchHistoryRules,
  searchKey,
  type SearchHistory,
} from '@auction-ng/shared';
import type { createDatabase } from '../database/client';

type Database = ReturnType<typeof createDatabase>;

/** Recent searches for signed-in buyers; see packages/shared/src/search-history.ts. */
export class SearchHistoryService {
  constructor(
    private readonly db: Database,
    private readonly enabled = process.env.SEARCH_HISTORY_ENABLED !== 'false',
    private readonly now = () => Date.now(),
  ) {}

  async list(userId: string): Promise<SearchHistory> {
    if (!this.enabled) return { enabled: false, items: [] };
    const rows = await this.db.buyerSearchHistory.findMany({
      where: { userId },
      orderBy: [{ searchedAt: 'desc' }, { queryKey: 'asc' }],
      take: searchHistoryRules.shown,
      select: { query: true },
    });
    return { enabled: true, items: rows.map(({ query }) => ({ query })) };
  }

  /** `queries` are newest first: one new search, or a guest list on sign-in. */
  async record(userId: string, queries: string[]): Promise<SearchHistory> {
    if (!this.enabled) return { enabled: false, items: [] };
    const unique = new Map<string, string>();
    for (const text of queries) {
      const query = normaliseSearch(text);
      if (query && !unique.has(searchKey(query)))
        unique.set(searchKey(query), query);
    }
    const base = this.now();
    await this.db.$transaction(async (tx) => {
      // One writer per buyer at a time, so trimming never races an insert.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('buyer-search-history'), hashtext(${userId}))`;
      let offset = 0;
      for (const [queryKey, query] of unique) {
        // Older entries in the list get earlier times, so order is preserved.
        const searchedAt = new Date(base - offset++);
        await tx.buyerSearchHistory.upsert({
          where: { userId_queryKey: { userId, queryKey } },
          create: { userId, queryKey, query, searchedAt },
          update: { query, searchedAt },
        });
      }
      await tx.$executeRaw`DELETE FROM buyer_search_history WHERE user_id=${userId}::uuid AND query_key NOT IN (SELECT query_key FROM buyer_search_history WHERE user_id=${userId}::uuid ORDER BY searched_at DESC, query_key LIMIT ${searchHistoryRules.kept})`;
    });
    return this.list(userId);
  }

  async remove(userId: string, query: string): Promise<SearchHistory> {
    if (!this.enabled) return { enabled: false, items: [] };
    await this.db.buyerSearchHistory.deleteMany({
      where: { userId, queryKey: searchKey(query) },
    });
    return this.list(userId);
  }

  async clear(userId: string): Promise<SearchHistory> {
    if (!this.enabled) return { enabled: false, items: [] };
    await this.db.buyerSearchHistory.deleteMany({ where: { userId } });
    return { enabled: true, items: [] };
  }
}
