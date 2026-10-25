import { z } from 'zod';
import {
  catalogueListInputSchema,
  catalogueListQuerySchema,
  cataloguePageSchema,
} from './catalogue-schemas';

export const searchRules = {
  queueName: 'auction-ng-search',
  pollMs: 2000,
  batchSize: 50,
  indexName: 'auction_ng_open_lots_v1',
  maxQueryLength: 120,
  requestTimeoutMs: 5000,
  syncTimeoutMs: 30000,
} as const;
const q = z.string().trim().min(1).max(searchRules.maxQueryLength);
export const searchInputSchema = catalogueListInputSchema.safeExtend({ q });
export const searchQuerySchema = catalogueListQuerySchema.safeExtend({ q });
export const searchPageSchema = cataloguePageSchema;
export type SearchInput = z.input<typeof searchInputSchema>;
export type SearchQuery = z.output<typeof searchInputSchema>;
