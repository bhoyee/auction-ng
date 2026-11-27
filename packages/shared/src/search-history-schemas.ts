import { z } from 'zod';
import { searchRules } from './search-schemas';
import { searchHistoryRules } from './search-history';

const query = z.string().trim().min(1).max(searchRules.maxQueryLength);
export const searchHistorySchema = z
  .object({
    enabled: z.boolean(),
    items: z.array(z.object({ query }).strict()).max(searchHistoryRules.kept),
  })
  .strict();
/** Newest first. */
export const searchHistoryRecordSchema = z
  .object({
    queries: z.array(query).min(1).max(searchHistoryRules.maxPerRequest),
  })
  .strict();
export const searchHistoryRemoveSchema = z.object({ query }).strict();
export type SearchHistory = z.infer<typeof searchHistorySchema>;
