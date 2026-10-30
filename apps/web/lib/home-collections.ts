import type { CatalogueLot } from '@auction-ng/shared/catalogue-schemas';
import { merchandisingRules, topDealEligible } from '@auction-ng/shared';

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
