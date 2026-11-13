import { BRAND_FIELD_KEY } from '@auction-ng/shared';
import type { Tx } from './lot-setup-base';
import { fieldError } from './lot-setup-base';
import { effectiveCategory } from './category-service';

// Checks a lot's bin and brand when a draft is saved: the bin must be at the
// lot's location, not deleted, taking new lots (unless the lot already sits
// in it) and have room; the brand must exist.
export async function lotSetupReferences(
  tx: Tx,
  v: {
    locationId: string;
    binId: string | null;
    brandId: string | null;
    currentBinId?: string | null;
  },
) {
  if (v.binId) {
    await tx.$queryRaw`SELECT id FROM bins WHERE id=${v.binId}::uuid FOR UPDATE`;
    const bin = await tx.bin.findUnique({ where: { id: v.binId } });
    if (!bin || bin.deletedAt || bin.locationId !== v.locationId)
      throw fieldError(
        'binId',
        'Pick a bin at this lot’s pickup location.',
        400,
      );
    if (bin.id !== v.currentBinId) {
      if (!bin.acceptsNewLots)
        throw fieldError(
          'binId',
          `${bin.code} is not taking new lots. Pick another bin.`,
          400,
        );
      // A full bin is allowed (owner decision 2026-11-13): the Create lot form
      // warns staff instead, because small items often still fit.
    }
  }
  if (v.brandId && !(await tx.brand.findUnique({ where: { id: v.brandId } })))
    throw fieldError('brandId', 'Pick a brand from the list.', 400);
}

// What still stops a lot from being published, in plain words. Applies the
// category rules and location bin rule current at publish time.
export async function publishProblems(tx: Tx, lotId: string) {
  const lot = await tx.lot.findUniqueOrThrow({
    where: { id: lotId },
    include: { category: true, location: true },
  });
  const problems: string[] = [];
  if (lot.location.status === 'closed')
    problems.push(
      `${lot.location.name} is closed. Move the lot to an open location.`,
    );
  if (lot.location.binRequiredToPublish && !lot.binId)
    problems.push(
      `Put this lot in a bin. ${lot.location.name} needs a bin before publishing.`,
    );
  const rules = await effectiveCategory(tx, lot.category);
  const photos = await tx.lotImage.count({ where: { lotId } });
  const needed = Math.max(1, rules.minPhotos ?? 1);
  if (photos < needed)
    problems.push(
      `Add ${needed - photos} more ${needed - photos === 1 ? 'photo' : 'photos'}. ${lot.category.name} needs ${needed}.`,
    );
  if (!rules.conditions.includes(lot.condition))
    problems.push(
      `${lot.category.name} doesn’t allow this condition. Pick another condition.`,
    );
  if (
    rules.minStartPriceKobo !== null &&
    Number(lot.startPriceKobo) < rules.minStartPriceKobo
  )
    problems.push(
      `The starting bid is below this category’s lowest start price.`,
    );
  const details =
    lot.details &&
    typeof lot.details === 'object' &&
    !Array.isArray(lot.details)
      ? (lot.details as Record<string, unknown>)
      : {};
  const missing = rules.fields
    .filter((f) => f.required)
    .filter((f) =>
      f.key === BRAND_FIELD_KEY
        ? !lot.brandId &&
          (details[f.key] === undefined || details[f.key] === '')
        : details[f.key] === undefined || details[f.key] === '',
    )
    .map((f) => f.name);
  if (missing.length) problems.push(`Fill in: ${missing.join(', ')}.`);
  return problems;
}
