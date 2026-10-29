import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const sharp = require('sharp');
for (const name of ['all-deals', 'top-deals', 'ending-soon']) {
  const root = new URL(`../apps/web/public/banners/${name}`, import.meta.url);
  await sharp(fileURLToPath(`${root.href}.png`))
    .webp({ quality: 85 })
    .toFile(fileURLToPath(`${root.href}.webp`));
}
console.log('Prepared three lightweight deals heading images.');
