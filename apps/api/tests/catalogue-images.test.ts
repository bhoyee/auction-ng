import { expect, it } from 'vitest';
import sharp from 'sharp';
import { randomBytes } from 'node:crypto';
import {
  imageUploadInputSchema,
  catalogueListQuerySchema,
} from '@auction-ng/shared';
import { generateImages } from '../src/catalogue/image-processing';

it('rejects unknown fields, fractional/unsafe prices, bad cursors and reversed ranges', () => {
  for (const query of [
    { limit: '51' },
    { limit: ['1', '2'] },
    { minPriceKobo: '1.2' },
    { maxPriceKobo: '9007199254740992' },
    { minPriceKobo: '200', maxPriceKobo: '100' },
    { status: 'draft' },
    { cursor: '!' },
  ])
    expect(catalogueListQuerySchema.safeParse(query).success).toBe(false);
  expect(
    catalogueListQuerySchema.parse({
      endingSoon: 'false',
      minPriceKobo: '50000',
    }),
  ).toMatchObject({ limit: 50, endingSoon: false, minPriceKobo: 50000 });
  expect(
    imageUploadInputSchema.safeParse({
      idempotencyKey: crypto.randomUUID(),
      sizeBytes: 100,
      contentType: 'image/svg+xml',
      sha256: 'a'.repeat(64),
      sortOrder: 0,
    }).success,
  ).toBe(false);
});
it('creates bounded WebP sizes, strips metadata and keeps noisy thumbnails within 30 KB', async () => {
  const input = await sharp(randomBytes(900 * 600 * 3), {
    raw: { width: 900, height: 600, channels: 3 },
  })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Artist: 'Private warehouse phone' } } })
    .toBuffer();
  const result = await generateImages(input, 'image/jpeg');
  expect(result.thumbnail.length).toBeLessThanOrEqual(30000);
  expect(result.width).toBe(900);
  const thumbnail = await sharp(result.thumbnail).metadata();
  expect(thumbnail).toMatchObject({ format: 'webp', width: 320 });
  expect(thumbnail.exif).toBeUndefined();
  expect((await sharp(result.display).metadata()).exif).toBeUndefined();
});
it('rejects corrupt, SVG, wrong MIME, animated and oversized-pixel images', async () => {
  const png = await sharp({
    create: { width: 2, height: 2, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  const huge = await sharp({
    create: { width: 5000, height: 5000, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  const animated = await sharp(
    Buffer.concat([Buffer.alloc(12), Buffer.alloc(12, 255)]),
    {
      raw: {
        width: 2,
        height: 4,
        channels: 3,
        pageHeight: 2,
      },
    },
  )
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
  expect((await sharp(animated).metadata()).pages).toBe(2);
  for (const [data, mime] of [
    [Buffer.from('not a photo'), 'image/jpeg'],
    [Buffer.from('<svg width="2" height="2"></svg>'), 'image/png'],
    [png, 'image/jpeg'],
    [huge, 'image/png'],
    [animated, 'image/webp'],
  ] as const)
    await expect(generateImages(data, mime)).rejects.toThrow();
});
