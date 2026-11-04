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
await sharp(icon)
  .resize(1024, 1024)
  .flatten({ background: tokens.colors['indigo-900'] })
  .png()
  .toFile(path('apps/mobile/assets/lotvanta-icon.png'));
// The supplied icon has opaque black corners. A circular viewport excludes
// those corners without recolouring or replacing the owner's LV artwork.
await sharp(icon)
  .resize(512, 512)
  .composite([
    {
      input: Buffer.from(
        '<svg width="512" height="512"><circle cx="256" cy="256" r="256" fill="white"/></svg>',
      ),
      blend: 'dest-in',
    },
  ])
  .png()
  .toFile(path('apps/mobile/assets/launch-icon.png'));
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
