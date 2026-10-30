import { z } from 'zod';
import { databaseValues } from './database-values';
import {
  cataloguePageSchema,
  pageInputSchema,
  pageQuerySchema,
} from './catalogue-schemas';
export const dealPriceBands = [
  { id: 'under-30000', min: 0, max: 3000000 },
  { id: 'under-100000', min: 0, max: 10000000 },
  { id: '100000-plus', min: 10000000, max: null },
] as const;
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
  section: z.enum(['all', 'top-deals', 'ending-soon']).default('all'),
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
export function dealBandsMatch(
  state: PublicBrowseState,
  filters: Pick<DealFilters, 'prices' | 'ends'>,
  now: number,
) {
  if (!state.open || state.endsAt <= now) return false;
  const price = state.currentPriceKobo ?? state.startPriceKobo;
  const remaining = state.endsAt - now;
  const day = 86400000;
  const startOfToday = Math.floor((now + 3600000) / day) * day - 3600000;
  return (
    (!filters.prices.length ||
      dealPriceBands.some(
        (band) =>
          filters.prices.includes(band.id) &&
          price >= band.min &&
          (band.max === null || price < band.max),
      )) &&
    (!filters.ends.length ||
      filters.ends.some((value) =>
        value === 'under-1h'
          ? remaining <= 3600000
          : value === 'today'
            ? state.endsAt < startOfToday + day
            : state.endsAt >= startOfToday + day &&
              state.endsAt < startOfToday + day * 2,
      ))
  );
}
