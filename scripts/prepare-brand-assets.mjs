import { tokens } from '../packages/ui/tokens.ts';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const sharp = require('sharp');
const root = new URL('../', import.meta.url);
const path = (name) => fileURLToPath(new URL(name, root));
const logo = path('apps/web/public/img/logo.png');
const icon = path('apps/web/public/img/lv-icon.png');
await mkdir(path('apps/admin/public/img'), { recursive: true });
for (const app of ['web', 'admin']) {
  await sharp(logo)
    .resize({ width: 600, withoutEnlargement: true })
    .webp({ quality: 90 })
    .toFile(path(`apps/${app}/public/img/logo.webp`));
  for (const size of [32, 180, 192, 512]) {
    await sharp(icon)
      .resize(size, size)
      .png()
      .toFile(path(`apps/${app}/public/img/icon-${size}.png`));
  }
}
await sharp(logo)
  .resize({ width: 900, withoutEnlargement: true })
  .png()
  .toFile(path('apps/mobile/assets/lotvanta-logo.png'));
// Black source pixels remain inside a circular crop at the top/bottom edges.
// Remove that neutral backing before resizing so it cannot form a dark fringe.
const iconPixels = await sharp(icon)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
for (let offset = 0; offset < iconPixels.data.length; offset += 4) {
  if (
    Math.max(
      iconPixels.data[offset],
      iconPixels.data[offset + 1],
      iconPixels.data[offset + 2],
    ) < 60
  ) {
    iconPixels.data[offset + 3] = 0;
  }
}
const launchPixels = await sharp(iconPixels.data, {
  raw: {
    width: iconPixels.info.width,
    height: iconPixels.info.height,
    channels: 4,
  },
})
  .resize(512, 512)
  .composite([
    {
      input: Buffer.from(
        '<svg width="512" height="512"><circle cx="256" cy="256" r="256" fill="white"/></svg>',
      ),
      blend: 'dest-in',
    },
  ])
  .raw()
  .toBuffer({ resolveWithObject: true });
// Resampling can mix transparent black into edge pixels; remove that fringe too.
for (let offset = 0; offset < launchPixels.data.length; offset += 4) {
  if (
    Math.max(
      launchPixels.data[offset],
      launchPixels.data[offset + 1],
      launchPixels.data[offset + 2],
    ) < 60
  ) {
    launchPixels.data[offset + 3] = 0;
  }
}
await sharp(launchPixels.data, {
  raw: { width: 512, height: 512, channels: 4 },
})
  .png()
  .toFile(path('apps/mobile/assets/launch-icon.png'));
// Android development launchers can show the app icon instead of the splash.
await sharp(launchPixels.data, {
  raw: { width: 512, height: 512, channels: 4 },
})
  .resize(1024, 1024)
  .flatten({ background: tokens.colors['indigo-900'] })
  .png()
  .toFile(path('apps/mobile/assets/lotvanta-icon.png'));
const launchLogo = await sharp({
  text: {
    text: `<span foreground="${tokens.colors.surface}" weight="bold">Lot</span><span foreground="${tokens.colors['danfo-400']}" weight="bold">Vanta</span>`,
    font: 'Schibsted Grotesk Bold',
    fontfile: path('packages/ui/fonts/schibsted-grotesk.ttf'),
    width: 780,
    height: 150,
    rgba: true,
  },
})
  .png()
  .toBuffer();
await sharp(launchLogo).toFile(path('apps/mobile/assets/launch-wordmark.png'));
await sharp({
  create: {
    width: 1000,
    height: 1000,
    channels: 4,
    background: tokens.colors['indigo-900'],
  },
})
  .composite([{ input: launchLogo, gravity: 'centre' }])
  .png()
  .toFile(path('apps/mobile/assets/launch-native.png'));
console.log(
  'Prepared LotVanta web/admin logos, favicons and native app/launch assets from owner-supplied artwork.',
);
