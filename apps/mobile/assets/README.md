# Mobile brand assets

Run `node scripts/prepare-mobile-brand.mjs` from the repository root with Node 22 to regenerate these assets using the existing Sharp dependency.

The launch wordmark is rendered from the local Schibsted Grotesk font and shared Auction NG tokens. It is typography, not a new logo. No AI artwork or external rendering service is used.

`home-phone.webp` is a bundled 480 px derivative of the existing credited representative promotion: Joshua Woroniecki, [Modern Smartphone in Studio](https://www.pexels.com/photo/modern-smartphone-in-studio-19800760/), [Pexels licence](https://www.pexels.com/license/). It is promotional imagery, not a photograph of inspected sale stock. See `apps/web/public/demo/CREDITS.md`.

`launch-theme.json` is generated from `packages/ui/tokens.ts`. Do not edit its colour independently.

`launch-wordmark.png` and `launch-tagline.png` are tightly cropped transparent typography for the app-loading screen. `launch-native.png` combines the existing wordmark with the Lucide Gavel icon on a yellow tile for the installed native splash. The gavel is an auction illustration, not a replacement logo. All are bundled locally; no download is required at startup.
