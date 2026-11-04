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
await sharp(tagline)
  .png()
  .toFile(fileURLToPath(new URL('launch-tagline.png', assets)));
await import('./prepare-brand-assets.mjs');
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
    { backgroundColor: tokens.colors['indigo-900'], imageWidth: 300 },
    null,
    2,
  ) + '\n',
);
