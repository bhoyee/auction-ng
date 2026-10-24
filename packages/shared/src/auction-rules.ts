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
  tiers = DEFAULT_INCREMENT_TIERS,
): number {
  assertKobo(startPriceKobo);
  return currentPriceKobo === null
    ? startPriceKobo
    : addKobo(currentPriceKobo, bidIncrement(currentPriceKobo, tiers));
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
