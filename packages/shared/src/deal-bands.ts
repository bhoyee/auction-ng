// Pure deal-band matching shared by the API and buyer pages. Kept free of
// Zod/catalogue schemas so client bundles that only filter cards stay small.
export const dealPriceBands = [
  { id: 'under-30000', min: 0, max: 3000000 },
  { id: 'under-100000', min: 0, max: 10000000 },
  { id: '100000-plus', min: 10000000, max: null },
] as const;
export type DealBandState = {
  open: boolean;
  startPriceKobo: number;
  currentPriceKobo: number | null;
  endsAt: number;
};
export type DealBandFilters = {
  prices: readonly string[];
  ends: readonly string[];
};
// priceKobo overrides the live bid for price bands (Instant Win filters by
// the fixed Buy Now price, which is what the buyer pays there).
export function dealBandsMatch(
  state: DealBandState,
  filters: DealBandFilters,
  now: number,
  priceKobo?: number,
) {
  if (!state.open || state.endsAt <= now) return false;
  const price = priceKobo ?? state.currentPriceKobo ?? state.startPriceKobo;
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
