// Builds every GiddyDeal logo, favicon and app/launch image from the
// owner-supplied artwork in packages/ui/brand (2026-11-20). Run from the
// repository root with Node 22: `node scripts/prepare-brand-assets.mjs`.
import { tokens } from '../packages/ui/tokens.ts';
import { createRequire } from 'node:module';
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const sharp = require('sharp');
const root = new URL('../', import.meta.url);
const path = (name) => fileURLToPath(new URL(name, root));
const source = (name) => path(`packages/ui/brand/${name}`);

// The supplied logo sits on solid white. Turn white into transparency
// ("colour to alpha"): composited back on white it is pixel-identical, and on
// the light grey canvas there is no white box or halo.
const white = await sharp(source('logo-on-white.png'))
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width, height } = white.info;
const rgba = Buffer.alloc(width * height * 4);
for (let i = 0, o = 0; i < white.data.length; i += 3, o += 4) {
  const r = white.data[i],
    g = white.data[i + 1],
    b = white.data[i + 2];
  const a = Math.max(255 - r, 255 - g, 255 - b);
  if (a < 6) continue; // paper noise stays fully transparent
  const un = (c) => Math.round(255 - ((255 - c) * 255) / a);
  rgba[o] = un(r);
  rgba[o + 1] = un(g);
  rgba[o + 2] = un(b);
  rgba[o + 3] = a;
}
const logo = await sharp(rgba, { raw: { width, height, channels: 4 } })
  .trim({ threshold: 1 })
  .png()
  .toBuffer();

// The icon's rounded square comes on opaque black corners; cut them away.
const iconSize = 512;
const inset = 4;
const radius = 132;
const icon = await sharp(source('icon-512.png'))
  .resize(iconSize, iconSize)
  .ensureAlpha()
  .composite([
    {
      input: Buffer.from(
        `<svg width="${iconSize}" height="${iconSize}"><rect x="${inset}" y="${inset}" width="${iconSize - 2 * inset}" height="${iconSize - 2 * inset}" rx="${radius}" fill="white"/></svg>`,
      ),
      blend: 'dest-in',
    },
  ])
  .png()
  .toBuffer();

await mkdir(path('apps/admin/public/img'), { recursive: true });
for (const app of ['web', 'admin']) {
  for (const w of [240, 360, 480, 600]) {
    await sharp(logo)
      .resize({ width: w })
      .webp({ quality: 82, alphaQuality: 90, effort: 6 })
      .toFile(
        path(`apps/${app}/public/img/logo${w === 600 ? '' : `-${w}`}.webp`),
      );
  }
  for (const size of [32, 192, 512]) {
    await sharp(icon)
      .resize(size, size)
      .png()
      .toFile(path(`apps/${app}/public/img/icon-${size}.png`));
  }
  // Apple touch icons must be opaque; iOS rounds the corners itself.
  await sharp(icon)
    .resize(180, 180)
    .flatten({ background: tokens.colors.surface })
    .png()
    .toFile(path(`apps/${app}/public/img/icon-180.png`));
  await copyFile(source('favicon.ico'), path(`apps/${app}/public/favicon.ico`));
}
// Square mark for the compact phone header.
await sharp(icon)
  .resize(96, 96)
  .webp({ quality: 90, alphaQuality: 100 })
  .toFile(path('apps/web/public/img/gd-mark-96.webp'));
// Email header (shown 176 px wide, attached inline) and the coming-soon page.
// The email logo is attached to every message: keep it under 20 KB
// (tests/email-branding.test.ts) while still sharp on 2x screens.
await sharp(logo)
  .resize({ width: 320 })
  .png({ palette: true, effort: 10 })
  .toFile(path('packages/ui/emails/logo.png'));
await sharp(logo)
  .resize({ width: 440 })
  .png()
  .toFile(path('infra/coming-soon/logo.png'));
await sharp(icon)
  .resize(32, 32)
  .png()
  .toFile(path('infra/coming-soon/favicon.png'));

// Mobile: in-app logo, installed app icon and launch artwork.
await sharp(logo)
  .resize({ width: 900 })
  .png()
  .toFile(path('apps/mobile/assets/giddydeal-logo.png'));
await sharp(icon).png().toFile(path('apps/mobile/assets/launch-icon.png'));
// Launchers apply their own mask, so fill the cut corners with the icon blue.
await sharp(icon)
  .resize(1024, 1024)
  .flatten({ background: '#0A1C9E' })
  .png()
  .toFile(path('apps/mobile/assets/giddydeal-icon.png'));
// Typeset wordmark for the indigo launch screen: it spells the brand name
// correctly while the supplied artwork still reads "GiddyDeals".
const launchLogo = await sharp({
  text: {
    text: `<span foreground="${tokens.colors.surface}" weight="bold">Giddy</span><span foreground="${tokens.colors['danfo-400']}" weight="bold">Deal</span>`,
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
  'Prepared GiddyDeal web/admin logos, favicons, email logo and native app/launch assets.',
);
