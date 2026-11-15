import { describe, expect, it } from 'vitest';
import {
  binHasRoom,
  binRange,
  binStatus,
  canDeleteBin,
  canDeleteBrand,
  canDeleteCategory,
  canDeleteCondition,
  canDeleteLocation,
  canDeleteSupplier,
  categoryFieldSchema,
  locationSaveSchema,
  runTimeLabel,
  slugify,
} from '../packages/shared/src/lot-setup';

describe('slugify', () => {
  it.each([
    ['Phones', 'phones'],
    ['Home and furniture', 'home-and-furniture'],
    ['Tools & DIY', 'tools-and-diy'],
    ['  Baby   and kids!  ', 'baby-and-kids'],
    ['Électronique', 'electronique'],
    ['iPhones 15/16', 'iphones-15-16'],
    ['---', ''],
  ])('%s -> %s', (name, slug) => expect(slugify(name)).toBe(slug));
  it('keeps slugs within 120 characters without a trailing dash', () => {
    const slug = slugify('a '.repeat(200));
    expect(slug.length).toBeLessThanOrEqual(120);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('binRange', () => {
  it('makes padded names for a number range', () => {
    expect(binRange('S-', 6, 10)).toEqual({
      ok: true,
      codes: ['S-06', 'S-07', 'S-08', 'S-09', 'S-10'],
    });
  });
  it('pads to the widest number', () => {
    const result = binRange('s-', 98, 101);
    expect(result).toEqual({
      ok: true,
      codes: ['S-098', 'S-099', 'S-100', 'S-101'],
    });
  });
  it('never produces duplicates', () => {
    const result = binRange('CAGE-', 1, 100);
    if (!result.ok) throw new Error(result.error);
    expect(new Set(result.codes).size).toBe(result.codes.length);
  });
  it('stops the whole batch when a name already exists', () => {
    expect(binRange('S-', 6, 10, ['s-08'])).toEqual({
      ok: false,
      error:
        'S-08 already exists. Change the start of the name or the numbers.',
    });
  });
  it.each([
    [10, 6, 'The second number must be the larger one.'],
    [1, 101, 'Add up to 100 bins at a time.'],
    [-1, 3, 'Use whole numbers from 0 upwards.'],
  ])('rejects %i to %i', (from, to, error) =>
    expect(binRange('S-', from, to)).toEqual({ ok: false, error }),
  );
  it('rejects names that would not fit on a label', () => {
    expect(binRange('S--', 1, 2).ok).toBe(false);
  });
});

describe('bin limit and status', () => {
  it('treats an empty limit as no limit', () => {
    expect(binHasRoom(null, 10_000)).toBe(true);
  });
  it('allows lots up to the limit and not beyond', () => {
    expect(binHasRoom(5, 4)).toBe(true);
    expect(binHasRoom(5, 5)).toBe(false);
    expect(binHasRoom(5, 3, 2)).toBe(true);
    expect(binHasRoom(5, 3, 3)).toBe(false);
  });
  it('derives the status shown in the bins table', () => {
    expect(binStatus({ acceptsNewLots: true, lots: 3 })).toBe('in_use');
    expect(binStatus({ acceptsNewLots: true, lots: 0 })).toBe('empty');
    expect(binStatus({ acceptsNewLots: false, lots: 18 })).toBe('closed');
  });
});

describe('can delete?', () => {
  it('category: only when it has no lots and no subcategories', () => {
    expect(canDeleteCategory({ lots: 0, children: 0 })).toEqual({
      allowed: true,
    });
    expect(canDeleteCategory({ lots: 1204, children: 5 })).toEqual({
      allowed: false,
      reason: 'Move its 1,204 lots first.',
      safeOption: 'move-lots',
    });
    expect(canDeleteCategory({ lots: 1, children: 0 })).toMatchObject({
      reason: 'Move its 1 lot first.',
    });
    expect(canDeleteCategory({ lots: 0, children: 2 })).toMatchObject({
      allowed: false,
      safeOption: 'hide',
    });
  });
  it('location: only if it never held a lot', () => {
    expect(canDeleteLocation({ everHeldLots: false })).toEqual({
      allowed: true,
    });
    expect(canDeleteLocation({ everHeldLots: true })).toMatchObject({
      allowed: false,
      safeOption: 'close',
    });
  });
  it('bin: only when empty', () => {
    expect(canDeleteBin({ lots: 0 })).toEqual({ allowed: true });
    expect(canDeleteBin({ lots: 18 })).toMatchObject({
      allowed: false,
      safeOption: 'not-for-new-lots',
    });
  });
  it('condition: never, switch it off instead', () => {
    expect(canDeleteCondition()).toMatchObject({
      allowed: false,
      safeOption: 'switch-off',
    });
  });
  it('supplier: only without batches', () => {
    expect(canDeleteSupplier({ batches: 0 })).toEqual({ allowed: true });
    expect(canDeleteSupplier({ batches: 3 })).toMatchObject({
      safeOption: 'deactivate',
    });
  });
  it('brand: only when no lot uses it', () => {
    expect(canDeleteBrand({ lots: 0 })).toEqual({ allowed: true });
    expect(canDeleteBrand({ lots: 7 })).toMatchObject({ safeOption: 'merge' });
  });
});

describe('schemas', () => {
  it('needs options for a pick-from-list field', () => {
    const base = {
      name: 'Storage',
      key: 'storage',
      required: true,
      showToBuyers: true,
    };
    expect(
      categoryFieldSchema.safeParse({ ...base, type: 'list', options: [] })
        .success,
    ).toBe(false);
    expect(
      categoryFieldSchema.safeParse({
        ...base,
        type: 'list',
        options: ['64GB', '128GB'],
      }).success,
    ).toBe(true);
  });
  // Owner decision 2026-11-13: the server generates the short code and it is
  // read-only, so a code sent by a client is optional and ignored.
  it('no longer needs a location code from staff', () => {
    expect(locationSaveSchema.shape.code.safeParse(undefined).success).toBe(
      true,
    );
    expect(locationSaveSchema.shape.code.safeParse('IKJ').success).toBe(true);
    expect(locationSaveSchema.shape.code.safeParse('IKJA').success).toBe(false);
  });
  it('labels run times', () => {
    expect(runTimeLabel(1440)).toBe('24 hours');
    expect(runTimeLabel(90)).toBe('90 minutes');
  });
});
