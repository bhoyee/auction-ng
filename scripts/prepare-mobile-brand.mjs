import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tokens } from '../packages/ui/tokens.ts';

const require = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const sharp = require('sharp');
const assets = new URL('../apps/mobile/assets/', import.meta.url);
await mkdir(assets, { recursive: true });
const fontfile = fileURLToPath(
  new URL('../packages/ui/fonts/schibsted-grotesk.ttf', import.meta.url),
);
const wordmark = await sharp({
  text: {
    text: `<span foreground="${tokens.colors.surface}"><b>Auction</b></span> <span foreground="${tokens.colors['danfo-400']}"><b>NG</b></span>`,
    font: 'Schibsted Grotesk Bold',
    fontfile,
    width: 800,
    height: 130,
    rgba: true,
  },
})
  .png()
  .toBuffer();
const tagline = await sharp({
  text: {
    text: `<span foreground="${tokens.colors.surface}">Bid. Win. Save.</span>`,
    font: 'Schibsted Grotesk',
    fontfile,
    width: 360,
    height: 45,
    rgba: true,
  },
})
  .png()
  .toBuffer();
await sharp({
  create: { width: 960, height: 540, channels: 4, background: 'transparent' },
})
  .composite([
    { input: wordmark, gravity: 'centre' },
    { input: tagline, top: 380, left: 300 },
  ])
  .png()
  .toFile(fileURLToPath(new URL('launch-wordmark.png', assets)));
// Reuse the already credited photograph; bundle a small copy for weak networks.
await sharp(
  fileURLToPath(
    new URL('../apps/web/public/demo/hero-phone-hq-640.webp', import.meta.url),
  ),
)
  .resize({ width: 480, withoutEnlargement: true })
  .webp({ quality: 78 })
  .toFile(fileURLToPath(new URL('home-phone.webp', assets)));
await writeFile(
  new URL('launch-theme.json', assets),
  JSON.stringify(
    { backgroundColor: tokens.colors['indigo-900'], imageWidth: 260 },
    null,
    2,
  ) + '\n',
);
