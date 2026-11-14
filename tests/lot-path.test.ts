import { describe, expect, it } from 'vitest';
import {
  lotPath,
  lotSlug,
  parseLotPath,
} from '../packages/shared/src/lot-path';

describe('readable lot addresses', () => {
  it.each([
    ['Iphone15 256gb black unlocked', 'iphone15-256gb-black-unlocked'],
    ['Tecno Camon 30, 256GB', 'tecno-camon-30-256gb'],
    ['Crème brûlée torch & lighter', 'creme-brulee-torch-and-lighter'],
    ['  HP 15" laptop — Core i5 / 8GB RAM  ', 'hp-15-laptop-core-i5-8gb-ram'],
    ['₦₦₦', ''],
  ])('slugs %j as %j', (title, slug) => {
    expect(lotSlug(title)).toBe(slug);
  });

  it('cuts long titles on a word boundary at 60 characters', () => {
    const slug = lotSlug(
      'Samsung Galaxy S24 Ultra 512GB titanium grey with original box charger and case',
    );
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug.startsWith('samsung-galaxy-s24-ultra-512gb')).toBe(true);
    expect(lotSlug('x'.repeat(80))).toHaveLength(60);
  });

  it('keeps lots with the same title apart by their code', () => {
    const a = lotPath({ title: 'Tecno Spark 20', lotNumber: 'LOT-2XXGQGJX' });
    const b = lotPath({ title: 'Tecno Spark 20', lotNumber: 'LOT-9KMP4ZRT' });
    expect(a).toBe('/lots/tecno-spark-20-lot-2xxgqgjx');
    expect(b).toBe('/lots/tecno-spark-20-lot-9kmp4zrt');
  });

  it('reads the lot number back, including older numeric codes', () => {
    expect(parseLotPath('tecno-spark-20-lot-2xxgqgjx')).toBe('LOT-2XXGQGJX');
    expect(parseLotPath('lot-000123')).toBe('LOT-000123');
    expect(parseLotPath('white-skincare-jars-demo-preview-qhxtjv46')).toBe(
      'DEMO-PREVIEW-QHXTJV46',
    );
    expect(parseLotPath('kettle-demo-ab12cd34')).toBe('DEMO-AB12CD34');
    // A title ending in "demo" still finds the real lot number.
    expect(parseLotPath('phone-demo-lot-2xxgqgjx')).toBe('LOT-2XXGQGJX');
    expect(
      parseLotPath(
        lotPath({ title: '₦₦₦', lotNumber: 'LOT-AB12CD34' }).slice(6),
      ),
    ).toBe('LOT-AB12CD34');
    // A UUID or a name without a code is not a lot address.
    expect(parseLotPath('1c9430d2-a5ef-4c7b-99bf-ee237aa55383')).toBeNull();
    expect(parseLotPath('slot-machine')).toBeNull();
  });
});
