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
// Use a white backing for the supplied dark lettering on the indigo splash.
const launchLogo = await sharp(logo)
  .resize({ width: 780 })
  .extend({
    top: 32,
    bottom: 32,
    left: 32,
    right: 32,
    background: tokens.colors.surface,
  })
  .flatten({ background: tokens.colors.surface })
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
