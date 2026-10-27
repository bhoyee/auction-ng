import type { CatalogueLot } from '@auction-ng/shared/catalogue-schemas';

/** Reserve each lot once, so browsing another home rail reveals new inventory. */
export function homeCollections(items: CatalogueLot[], now: number) {
  const active = items.filter(
    (lot) => lot.status !== 'scheduled' && Date.parse(lot.endsAt) > now,
  );
  const used = new Set<string>();
  const photos = new Set<string>();
  const take = (lots: CatalogueLot[], count = 10) =>
    lots.reduce<CatalogueLot[]>((selected, lot) => {
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
    active.filter((lot) => Date.parse(lot.endsAt) - now <= 20 * 60 * 1000),
    6,
  );
  // Reserve the genuinely earliest lots before choosing the promotional collections.
  const ending = take(
    [...active].sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt)),
  );
  const under = take(active.filter((lot) => lot.startPriceKobo < 1_000_000));
  const rankedDeals = [...active].sort(
    (a, b) =>
      (b.retailPriceKobo - b.startPriceKobo) / Math.max(1, b.retailPriceKobo) -
      (a.retailPriceKobo - a.startPriceKobo) / Math.max(1, a.retailPriceKobo),
  );
  const seenCategories = new Set<string>();
  const firstInCategory = rankedDeals.filter((lot) => {
    if (
      used.has(lot.id) ||
      photos.has(lot.thumbnail?.thumbnailUrl ?? '') ||
      seenCategories.has(lot.categoryId)
    )
      return false;
    seenCategories.add(lot.categoryId);
    return true;
  });
  const deals = take([...firstInCategory, ...rankedDeals]);
  return { closing, ending, under, deals };
}
