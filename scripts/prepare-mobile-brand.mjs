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
  create: { width: 960, height: 200, channels: 4, background: 'transparent' },
})
  .composite([{ input: wordmark, gravity: 'centre' }])
  .png()
  .toFile(fileURLToPath(new URL('launch-wordmark.png', assets)));
await sharp(tagline)
  .png()
  .toFile(fileURLToPath(new URL('launch-tagline.png', assets)));
const webRequire = createRequire(
  new URL('../apps/web/package.json', import.meta.url),
);
const { createElement } = webRequire('react');
const { renderToStaticMarkup } = webRequire('react-dom/server');
const uiRequire = createRequire(
  new URL('../packages/ui/package.json', import.meta.url),
);
const { Gavel } = uiRequire('lucide-react');
const icon = await sharp(
  Buffer.from(
    renderToStaticMarkup(
      createElement(Gavel, {
        size: 168,
        strokeWidth: 1.8,
        color: tokens.colors['indigo-900'],
      }),
    ),
  ),
)
  .png()
  .toBuffer();
const tile = await sharp(
  Buffer.from(
    `<svg width="336" height="336" xmlns="http://www.w3.org/2000/svg"><rect width="336" height="336" rx="96" fill="${tokens.colors['danfo-400']}"/></svg>`,
  ),
)
  .composite([{ input: icon, gravity: 'centre' }])
  .png()
  .toBuffer();
await sharp({
  create: { width: 960, height: 960, channels: 4, background: 'transparent' },
})
  .composite([
    { input: tile, top: 150, left: 312 },
    { input: wordmark, top: 582, left: 80 },
  ])
  .png()
  .toFile(fileURLToPath(new URL('launch-native.png', assets)));
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
