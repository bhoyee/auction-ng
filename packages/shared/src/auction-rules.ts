import { addKobo, assertKobo } from './money';

export type IncrementTier = Readonly<{
  fromKobo: number;
  incrementKobo: number;
}>;
export const DEFAULT_INCREMENT_TIERS: readonly IncrementTier[] = Object.freeze(
  [
    { fromKobo: 0, incrementKobo: 10000 },
    { fromKobo: 500000, incrementKobo: 25000 },
    { fromKobo: 2000000, incrementKobo: 50000 },
    { fromKobo: 5000000, incrementKobo: 100000 },
    { fromKobo: 20000000, incrementKobo: 250000 },
    { fromKobo: 50000000, incrementKobo: 500000 },
  ].map((tier) => Object.freeze(tier)),
);
export const SOFT_CLOSE_MS = 120000;
export const WATCH_LAUNCH_REMINDER_MS = 10 * 60 * 1000;
export const CANCELLATION_REBID_MS = 10 * 60 * 1000;
export const BID_MODES = ['direct', 'automatic'] as const;
export type BidMode = (typeof BID_MODES)[number];
export const DEFAULT_BID_MODE: BidMode = 'direct';
// Entered bids must only exceed the displayed price; tiers apply to automatic counterbids.
export const MIN_BID_INCREASE_KOBO = 1;

export function bidIncrement(
  priceKobo: number,
  tiers = DEFAULT_INCREMENT_TIERS,
): number {
  assertKobo(priceKobo);
  if (tiers[0]?.fromKobo !== 0)
    throw new RangeError('Increment tiers must start at zero.');
  let previous = -1;
  let increment = 0;
  for (const tier of tiers) {
    assertKobo(tier.fromKobo);
    assertKobo(tier.incrementKobo);
    if (tier.fromKobo <= previous || tier.incrementKobo === 0)
      throw new RangeError(
        'Increment tiers must be ordered with positive increments.',
      );
    previous = tier.fromKobo;
    if (priceKobo >= tier.fromKobo) increment = tier.incrementKobo;
  }
  return increment;
}

export function minNextBid(
  startPriceKobo: number,
  currentPriceKobo: number | null,
): number {
  assertKobo(startPriceKobo);
  return currentPriceKobo === null
    ? startPriceKobo
    : addKobo(currentPriceKobo, MIN_BID_INCREASE_KOBO);
}

// Unsold relists (owner decision 2026-11-13): an optional admin-set
// percentage cut on each automatic relist. It compounds per relist, rounds
// half up to whole Naira and never takes a price below ₦500 (a lot that
// already starts below ₦500 keeps its price).
export const RELIST_PRICE_FLOOR_KOBO = 50_000;
export const RELIST_MAX_PRICE_CUT_PERCENT = 50;
export function relistStartPrice(
  startKobo: number,
  percent: number,
  // The category's lowest start price, when higher than ₦500.
  floorKobo: number = RELIST_PRICE_FLOOR_KOBO,
): number {
  assertKobo(startKobo);
  assertKobo(floorKobo);
  if (
    !Number.isInteger(percent) ||
    percent < 0 ||
    percent > RELIST_MAX_PRICE_CUT_PERCENT
  )
    throw new RangeError('Price cut must be a whole percentage from 0 to 50.');
  if (percent === 0) return startKobo;
  // bigint keeps the maths exact for any safe kobo amount.
  const cut = BigInt(startKobo) * BigInt(100 - percent); // kobo × 100
  const naira = (cut + 5_000n) / 10_000n; // round half up to ₦1
  const floor = Math.max(floorKobo, RELIST_PRICE_FLOOR_KOBO);
  return Math.max(Number(naira * 100n), Math.min(startKobo, floor));
}

export class LotClosedError extends Error {}
export function softCloseEnd(
  now: number,
  endsAt: number,
  windowMs = SOFT_CLOSE_MS,
): number {
  assertKobo(now);
  assertKobo(endsAt);
  assertKobo(windowMs);
  if (windowMs === 0)
    throw new RangeError('Soft-close window must be positive.');
  if (now >= endsAt) throw new LotClosedError('The lot has closed.');
  return endsAt - now <= windowMs ? addKobo(now, windowMs) : endsAt;
}
