# Homepage layout review — 27 October 2026

Open **http://localhost:3300** and press **Ctrl+F5**. This review supersedes the earlier split-width composition in `../header/composition/`. T13 remains under review; T14 has not started.

## What changed

- One 1400 px usable content measure, with 16/24/32 px minimum phone/tablet/desktop gutters. Header, navigation, hero, categories, section headings, rails and footer share the same edges.
- Desktop hero: 70/30 composition, 380 px high, with a solid copy panel and edge-to-edge product photo. Phone: carousel only, 4:3, concise copy and a reserved control bar. Search includes a category selector on larger screens; the simpler lower navigation remains.
- Stable collapsing header: desktop and phone retain a compact search/account row without moving the page when it collapses. Help still contains WhatsApp. Account controls remain available in the expanded header.
- Category discovery moves above the product collections. Rails show five cards at 1440 px, four at 1280 px, three on tablets and about 1.5 on narrow phones. Previous/next controls, keyboard access, swipe and See all remain available.
- Unique lot identities and representative photos across rails. Top deals introduces category variety; Next to close reserves the earliest auctions. The Closing now band renders only with actual lots in its twenty-minute window. The long-lived demo currently has no qualifying imminent lots, so its absence is intentional.
- Square, clickable product photos, two-line titles, prominent prices and accessible retail estimates. Starting bid appears only when no bid exists. Current prices are public over a separate read-only channel; personal leader state and bidding remain authenticated.
- A single signed-out-only buying/trust strip, a contained app banner no taller than 320 px with a refreshed upright phone preview, and an aligned footer without trailing space.
- Sixty distinct credited product photographs across the existing 120 synthetic lots. All thumbnails remain below 30 KB. No auction schedules, bids or wallet funds were changed.

## Screenshots

Full-page captures use real local email authentication for the signed-in state. No routes or price responses were mocked. All balances and inventory shown belong to the isolated synthetic demo. `top-*` files provide larger header/hero views; four `sticky-*` files show the collapsed header at 360 and 1440 px.

| Width | Signed out | Signed in |
| --- | --- | --- |
| 360 px | [Full page](home-signed-out-360.png) | [Full page](home-signed-in-360.png) |
| 768 px | [Full page](home-signed-out-768.png) | [Full page](home-signed-in-768.png) |
| 1280 px | [Full page](home-signed-out-1280.png) | [Full page](home-signed-in-1280.png) |
| 1440 px | [Full page](home-signed-out-1440.png) | [Full page](home-signed-in-1440.png) |
| 1920 px | [Full page](home-signed-out-1920.png) | [Full page](home-signed-in-1920.png) |

## Targeted verification

No full application test suite was run for this correction. Full CI requirements are unchanged.

- Changed-file ESLint/Prettier and affected web, UI, API-client, API and realtime type checks passed. The changed browser/test files also passed a scoped TypeScript check.
- Six relevant test files passed **39 tests**: home collection selection, image aliases, photo credits/size/uniqueness, demo scheduling, public realtime snapshots/updates/reconnect and private-channel protection.
- Production builds passed for web and the affected API/realtime code. Other apps were not rebuilt for this correction.
- Homepage browser checks passed in both account states at all five widths: matching container bounds, rail density, no document overflow, square/loaded photos, distinct lots/photos, previous/next controls, image links, carousel navigation, sticky header, category search, offline price hiding/recovery, watchlist sign-in gate and visitor-only guide.
- [Measured layout results](results.json) and [homepage JavaScript measurement](home-public-script-budget.json): **about 197.1 KB compressed**, below the unchanged **200,000-byte** limit. This is a homepage-only check, not a new Lighthouse or whole-site performance audit.
- Staged files were checked for secrets before publication. Environment files and local tooling are excluded.

## Reference review and limits

Reviewed the available structures of [Jumia Nigeria](https://www.jumia.com.ng/), [Amazon](https://www.amazon.com/) and [eBay](https://www.ebay.com/) for search prominence, grouped shopping navigation, product density and explicit collection navigation. Amazon rendered in the local browser; Jumia and eBay returned anti-bot/error pages there, so their direct browser visual comparison was unavailable. Their accessible page content informed the structural review; this is not a claimed pixel comparison of all three sites.

Self-review retained Auction NG's indigo/yellow brand, Schibsted typography, honest auction pricing, actual counts, licensed demo disclosures, keyboard controls and reduced-motion support. Native store availability is still marked coming later. Owner visual acceptance and the previously recorded repeatable mobile LCP issue remain open for overall T13; this correction does not close those gates.

## File map

`apps/web/app/page.tsx` composes the homepage; `apps/web/lib/home-collections.ts` selects unique collections. Shared `packages/ui/web/home-layout.css`, `product-rail.tsx`, `sticky-marketplace-header.tsx`, `first-visit-guide.tsx`, `promo-carousel.tsx` and `auction.tsx` provide presentation and interaction. Tokens/theme define the shared widths. Buyer shell/search/realtime components connect the existing account and navigation flows.

`apps/realtime/src/public-market.ts`, the API's public snapshot method and typed realtime client provide public read access. See [the price boundary](../../specs/public-market-prices.md). Demo assets, seed selection and `scripts/update-demo-photos.mjs` supply the representative variety without resetting data. DESIGN.md, TASKS.md and decisions.md record the approved revision.
