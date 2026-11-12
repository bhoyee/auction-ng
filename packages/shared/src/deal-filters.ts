import { z } from 'zod';
import { databaseValues } from './database-values';
import {
  cataloguePageSchema,
  pageInputSchema,
  pageQuerySchema,
} from './catalogue-schemas';
export { dealPriceBands, dealBandsMatch } from './deal-bands';
export type { DealBandFilters, DealBandState } from './deal-bands';
export const dealEndBands = [
  { id: 'under-1h', label: 'Within 1 hour' },
  { id: 'today', label: 'Ends today' },
  { id: 'tomorrow', label: 'Ends tomorrow' },
] as const;
const prices = z.enum(['under-30000', 'under-100000', '100000-plus']);
const ends = z.enum(['under-1h', 'today', 'tomorrow']);
const conditions = z.enum(databaseValues.lotConditions);
const selection = <T extends z.ZodType<string>>(
  schema: T,
  defaults: z.output<T>[] = [],
) =>
  z
    .array(schema)
    .max(5)
    .default(defaults)
    .transform((values) => [...new Set(values)].sort());
const fields = {
  section: z
    .enum(['all', 'top-deals', 'ending-soon', 'instant-win'])
    .default('all'),
  categoryId: z.uuid().optional(),
  prices: selection(prices),
  ends: selection(ends),
  conditions: selection(conditions, [...databaseValues.lotConditions]),
};
export const dealListInputSchema = pageInputSchema.extend(fields);
const csv = <T extends z.ZodType<string>>(
  schema: T,
  defaults: z.output<T>[] = [],
) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' ? (value ? value.split(',') : []) : value,
    selection(schema, defaults),
  );
export const dealListQuerySchema = pageQuerySchema.extend({
  ...fields,
  prices: csv(prices),
  ends: csv(ends),
  conditions: csv(conditions, [...databaseValues.lotConditions]),
});
export const dealPageSchema = cataloguePageSchema
  .extend({ unavailableLiveCount: z.number().int().nonnegative() })
  .strict();
export type DealListInput = z.input<typeof dealListInputSchema>;
export type DealFilters = z.output<typeof dealListInputSchema>;
export type DealPage = z.infer<typeof dealPageSchema>;
export const publicBrowseStateSchema = z.object({
  open: z.boolean(),
  startPriceKobo: z.number().int().safe().nonnegative(),
  currentPriceKobo: z.number().int().safe().nonnegative().nullable(),
  endsAt: z.number().int().safe().nonnegative(),
});
export type PublicBrowseState = z.infer<typeof publicBrowseStateSchema>;
