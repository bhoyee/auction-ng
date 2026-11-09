import type { CatalogueLot } from '@auction-ng/shared/catalogue-schemas';
import {
  imageRules,
  merchandisingRules,
  topDealEligible,
} from '@auction-ng/shared';

/** Reserve each lot once, so browsing another home rail reveals new inventory. */
type HomeLot = Pick<
  CatalogueLot,
  | 'id'
  | 'status'
  | 'endsAt'
  | 'categoryId'
  | 'retailPriceKobo'
  | 'startPriceKobo'
  | 'isTopDeal'
  | 'topDealOrder'
> & { thumbnail: { thumbnailUrl: string } | null };
export function homeCollections<T extends HomeLot>(items: T[], now: number) {
  const active = items.filter(
    (lot) =>
      (lot.status === 'open' || lot.status === 'closing') &&
      Date.parse(lot.endsAt) > now,
  );
  const used = new Set<string>();
  const photos = new Set<string>();
  const take = (lots: T[], count = 10) =>
    lots.reduce<T[]>((selected, lot) => {
      const photo = lot.thumbnail?.thumbnailUrl;
      if (
        selected.length < count &&
        !used.has(lot.id) &&
        (!photo || !photos.has(photo))
      ) {
        used.add(lot.id);
        if (photo) photos.add(photo);
        selected.push(lot);
      }
      return selected;
    }, []);
  const closing = take(
    active.filter(
      (lot) =>
        Date.parse(lot.endsAt) - now <= merchandisingRules.closingWindowMs,
    ),
    6,
  );
  const rankedDeals = active
    .filter((lot) => topDealEligible(lot, now))
    .sort(
      (a, b) => a.topDealOrder - b.topDealOrder || a.id.localeCompare(b.id),
    );
  const deals = take(rankedDeals);
  return { closing, deals };
}

/** Returning buyers see the next genuine closing opportunities before featured stock. */
export function buyerHomeCollections<T extends HomeLot>(
  items: T[],
  now: number,
) {
  const ordered = [...items].sort(
    (a, b) =>
      Date.parse(a.endsAt) - Date.parse(b.endsAt) || a.id.localeCompare(b.id),
  );
  const closing = homeCollections(ordered, now).closing.slice(0, 4);
  const used = new Set(closing.map((lot) => lot.id));
  const ending = ordered
    .filter((lot) => {
      const remaining = Date.parse(lot.endsAt) - now;
      return (
        (lot.status === 'open' || lot.status === 'closing') &&
        remaining > merchandisingRules.closingWindowMs &&
        remaining <= imageRules.endingSoonMs
      );
    })
    .filter((lot) => {
      if (used.has(lot.id)) return false;
      used.add(lot.id);
      return true;
    })
    .slice(0, 4);
  const endingIds = new Set(ending.map((lot) => lot.id));
  const deals = homeCollections(
    items.filter((lot) => !endingIds.has(lot.id)),
    now,
  ).deals.slice(0, 4);
  return { closing, ending, deals };
}
