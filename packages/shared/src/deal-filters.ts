import { z } from 'zod';
import { databaseValues } from './database-values';
import {
  cataloguePageSchema,
  pageInputSchema,
  pageQuerySchema,
} from './catalogue-schemas';
export const dealPriceBands = [
  { id: 'under-5000', min: 0, max: 500000 },
  { id: '5000-20000', min: 500000, max: 2000000 },
  { id: '20000-50000', min: 2000000, max: 5000000 },
  { id: '50000-100000', min: 5000000, max: 10000000 },
  { id: '100000-plus', min: 10000000, max: null },
] as const;
export const dealEndBands = [
  { id: 'under-1h', label: 'Within 1 hour', min: 0, max: 3600000 },
  { id: '1-6h', label: '1–6 hours', min: 3600000, max: 21600000 },
  { id: '6-24h', label: '6–24 hours', min: 21600000, max: 86400000 },
  { id: '1-3d', label: '1–3 days', min: 86400000, max: 259200000 },
  { id: '3d-plus', label: '3 days or more', min: 259200000, max: null },
] as const;
const prices = z.enum([
  'under-5000',
  '5000-20000',
  '20000-50000',
  '50000-100000',
  '100000-plus',
]);
const ends = z.enum(['under-1h', '1-6h', '6-24h', '1-3d', '3d-plus']);
const conditions = z.enum(databaseValues.lotConditions);
const selection = <T extends z.ZodType<string>>(schema: T) =>
  z
    .array(schema)
    .max(5)
    .default([])
    .transform((values) => [...new Set(values)].sort());
const fields = {
  section: z.enum(['all', 'top-deals', 'ending-soon']).default('all'),
  categoryId: z.uuid().optional(),
  prices: selection(prices),
  ends: selection(ends),
  conditions: selection(conditions),
};
export const dealListInputSchema = pageInputSchema.extend(fields);
const csv = <T extends z.ZodType<string>>(schema: T) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' ? (value ? value.split(',') : []) : value,
    selection(schema),
  );
export const dealListQuerySchema = pageQuerySchema.extend({
  ...fields,
  prices: csv(prices),
  ends: csv(ends),
  conditions: csv(conditions),
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
  return (
    (!filters.prices.length ||
      dealPriceBands.some(
        (band) =>
          filters.prices.includes(band.id) &&
          price >= band.min &&
          (band.max === null || price < band.max),
      )) &&
    (!filters.ends.length ||
      dealEndBands.some(
        (band) =>
          filters.ends.includes(band.id) &&
          remaining >= band.min &&
          (band.max === null || remaining < band.max),
      ))
  );
}
