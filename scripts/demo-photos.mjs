import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const root = new URL('../', import.meta.url);
const require = createRequire(new URL('apps/api/package.json', root));
const { default: sharp } = await import(
  pathToFileURL(require.resolve('sharp')).href
);
const folder = new URL('apps/web/public/demo/', root);
await mkdir(folder, { recursive: true });
const photos = JSON.parse(
  await readFile(new URL('photos.json', folder), 'utf8'),
);
const credits = [
  '# Demo product photography',
  '',
  'Demo-only representative photographs, not actual sale inventory or evidence of inspection. Downloaded on 2026-10-26 under the [Pexels licence](https://www.pexels.com/license/) or [Unsplash licence](https://unsplash.com/license), as specified for each image. No endorsement by photographers, people or depicted brands is implied. Local WebP derivatives are resized/cropped for this marketplace demonstration. Each source is reused across explicitly synthetic lots of the matching product type.',
  '',
  '| Files | Photographer | Source | Licence |',
  '| --- | --- | --- | --- |',
];
for (const photo of photos) {
  const response = await fetch(
    photo.downloadUrl ??
      `https://images.pexels.com/photos/${photo.id}/pexels-photo-${photo.id}.jpeg?auto=compress&cs=tinysrgb&w=1600`,
    { signal: AbortSignal.timeout(30000) },
  );
  if (!response.ok)
    throw new Error(`Photo ${photo.key}: HTTP ${response.status}`);
  const source = Buffer.from(await response.arrayBuffer());
  for (const [suffix, width, quality] of [
    ['thumb', 400, 65],
    ['display', 960, 78],
  ]) {
    let output = await sharp(source)
      .rotate()
      .resize({
        width,
        height: width * 0.75,
        fit: ['kitchen', 'children', 'beauty', 'sports'].includes(photo.key)
          ? 'contain'
          : 'cover',
        background: 'white',
      })
      .webp({ quality })
      .toBuffer();
    if (suffix === 'thumb' && output.length > 30000)
      output = await sharp(source)
        .rotate()
        .resize({
          width: 320,
          height: 240,
          fit: 'contain',
          background: 'white',
        })
        .webp({ quality: 45 })
        .toBuffer();
    if (suffix === 'thumb' && output.length > 30000)
      throw new Error(`Thumbnail ${photo.key} exceeds 30 KB`);
    await writeFile(new URL(`${photo.key}-${suffix}.webp`, folder), output);
  }
  credits.push(
    `| ${photo.key}-{thumb,display}.webp | ${photo.author} | [Source photograph](${photo.source}) | ${photo.license ?? 'Pexels'} |`,
  );
  console.log(`Prepared ${photo.key}`);
}
await writeFile(new URL('CREDITS.md', folder), credits.join('\n') + '\n');
