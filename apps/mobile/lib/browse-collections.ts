import type { DealFilters } from '@auction-ng/shared';
import { formatNaira } from '@auction-ng/shared/money';

/** Browse tabs, in the website's deals-bar order (Instant Win 2026-11-10). */
export const browseCollections = [
  'All Deals',
  'Top Deals',
  'Ending Soon',
  'Instant Win',
  'Upcoming',
] as const;
export type BrowseCollection = (typeof browseCollections)[number];

const params: Partial<Record<BrowseCollection, string>> = {
  'Top Deals': 'top',
  'Ending Soon': 'ending',
  'Instant Win': 'instant',
};
const sections: Partial<Record<BrowseCollection, DealFilters['section']>> = {
  'Top Deals': 'top-deals',
  'Ending Soon': 'ending-soon',
  'Instant Win': 'instant-win',
};

/** The tab a `/browse?mode=` link opens; unknown values show All Deals. */
export function collectionFromParam(mode: string | undefined) {
  const match = Object.entries(params).find(([, value]) => value === mode);
  return (match?.[0] as BrowseCollection | undefined) ?? 'All Deals';
}

export function collectionParam(collection: BrowseCollection) {
  return params[collection] ?? 'all';
}

export function collectionSection(
  collection: BrowseCollection,
): DealFilters['section'] {
  return sections[collection] ?? 'all';
}

/**
 * The card's main action. On the Instant Win list a live lot with a fixed
 * price buys at that price (the item page opens its Buy Now review);
 * everywhere else the card leads to bidding.
 */
export function cardAction(input: {
  id: string;
  fixedPriceKobo: number | null;
  instantWin: boolean;
  upcoming: boolean;
  comingSoon: boolean;
  paused: boolean;
}) {
  const buyPrice =
    input.instantWin &&
    !input.upcoming &&
    input.fixedPriceKobo !== null &&
    Number.isSafeInteger(input.fixedPriceKobo) &&
    input.fixedPriceKobo > 0
      ? input.fixedPriceKobo
      : null;
  const href = buyPrice ? `/lots/${input.id}?buy=1` : `/lots/${input.id}`;
  const label = input.comingSoon
    ? 'View and watch'
    : input.upcoming
      ? 'View and pre-bid'
      : input.paused
        ? buyPrice
          ? 'Buying paused'
          : 'Bidding paused'
        : buyPrice
          ? `Buy now ${formatNaira(buyPrice)}`
          : 'Bid now';
  return { buyPrice, href, label };
}
