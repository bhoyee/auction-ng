import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';

// Reuse the existing Sharp installation; no additional image service is needed.
const require = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const sharp = require('sharp');
const sourceRoot = new URL('../apps/web/public/banners/', import.meta.url);
const outputRoot = new URL('optimized/', sourceRoot);
await mkdir(outputRoot, { recursive: true });
const images = [];
for (const number of [1, 2, 3]) {
  const input = await readFile(new URL(`guide-${number}.png`, sourceRoot));
  const hash = createHash('sha256')
    .update(input)
    .update('guide-responsive-v1')
    .digest('hex')
    .slice(0, 12);
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let left = info.width,
    top = info.height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 16) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < left)
    throw new Error(`Guide ${number} contains no visible artwork`);
  left = Math.max(0, left - 4);
  top = Math.max(0, top - 4);
  const width = Math.min(info.width - 1, right + 4) - left + 1;
  const height = Math.min(info.height - 1, bottom + 4) - top + 1;
  const widths = [...new Set([480, 800, Math.min(1200, width)])]
    .filter((size) => size <= width)
    .sort((a, b) => a - b);
  const name = (size, format) => `guide-${number}-${hash}-${size}.${format}`;
  await Promise.all(
    widths.flatMap((size) =>
      ['avif', 'webp'].map(async (format) => {
        const target = new URL(name(size, format), outputRoot);
        try {
          await access(target);
          return;
        } catch {
          /* First build of this source. */
        }
        const image = sharp(input)
          .extract({ left, top, width, height })
          .resize({ width: size, withoutEnlargement: true });
        if (format === 'avif')
          await image
            .avif({ quality: 65, effort: 4 })
            .toFile(fileURLToPath(target));
        else
          await image
            .webp({ quality: 88, effort: 4 })
            .toFile(fileURLToPath(target));
      }),
    ),
  );
  const srcSet = (format) =>
    widths
      .map((size) => `/banners/optimized/${name(size, format)} ${size}w`)
      .join(', ');
  images.push({
    width,
    height,
    src: `/banners/optimized/${name(widths.at(-1), 'webp')}`,
    webpSrcSet: srcSet('webp'),
    avifSrcSet: srcSet('avif'),
  });
}
await writeFile(
  new URL('../apps/web/lib/guide-images.generated.json', import.meta.url),
  JSON.stringify(images, null, 2) + '\n',
);
console.log('Prepared three responsive guide images.');
