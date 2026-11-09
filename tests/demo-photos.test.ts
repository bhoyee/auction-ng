import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { productImageSource } from '../packages/ui/web/demo-image';

it('ships sixty distinct credited demo photo sources with thumbnails below 30 KB', () => {
  const folder = new URL('../apps/web/public/demo/', import.meta.url);
  const base = JSON.parse(
    readFileSync(new URL('photos.json', folder), 'utf8'),
  ) as { key: string; source: string }[];
  const variants = JSON.parse(
    readFileSync(new URL('photo-variants.json', folder), 'utf8'),
  ) as { key: string; source: string; category: number }[];
  const photos = [...base, ...variants];
  expect(photos).toHaveLength(60);
  expect(new Set(photos.map((photo) => photo.source)).size).toBe(60);
  expect(
    variants.every(
      (photo) =>
        Number.isInteger(photo.category) &&
        photo.category >= 0 &&
        photo.category < 12,
    ),
  ).toBe(true);
  const credits = readFileSync(new URL('CREDITS.md', folder), 'utf8');
  const hashes = photos.map((photo) => {
    expect(credits).toContain(photo.source);
    expect(
      productImageSource(
        `https://demo.auction.invalid/demo/${photo.key}-thumb.webp`,
      ),
    ).toBe(`/demo/${photo.key}-thumb.webp`);
    const thumb = readFileSync(new URL(`${photo.key}-thumb.webp`, folder));
    expect(thumb.length).toBeLessThanOrEqual(30000);
    expect(thumb.subarray(8, 12).toString()).toBe('WEBP');
    return createHash('sha256').update(thumb).digest('hex');
  });
  expect(new Set(hashes).size).toBe(60);
});

it('keeps other image origins and unrecognised demo paths outside the local alias', () => {
  for (const source of [
    'https://example.test/demo/product-123-thumb.webp',
    'https://demo.auction.invalid/demo/../../private',
    'https://demo.auction.invalid/demo/unapproved-file.webp',
  ])
    expect(productImageSource(source)).toBe(source);
});
