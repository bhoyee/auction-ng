# Auction fee controls

Admin controls reuse the existing staff panel, inputs, buttons, notices and design tokens. Service charge, lot fee and VAT each have an independent checkbox and value. The form explains that accepted bids lock an auction's rates and that Buy Now tax remains separate. A reason is required. A failed or uncertain save shows an error; uncertain saves lock editing and retry the same request.

The buyer fee popup and confirmation use the auction's actual policy. These screenshots use synthetic browser fixtures: the admin example changes Service charge to 12.5% and disables the lot fee; the buyer example independently verifies 10% Service charge, no lot fee and 5% VAT on fees. They do not change the local marketplace's configured rates or move wallet money.

| Viewport | Admin | Buyer |
| --- | --- | --- |
| 360 px | [Settings](admin-360.png) | [Fee breakdown](buyer-360.png) |
| 768 px | [Settings](admin-768.png) | [Fee breakdown](buyer-768.png) |
| 1280 px | [Settings](admin-1280.png) | [Fee breakdown](buyer-1280.png) |

Targeted browser checks verify exact retry payloads after an uncertain save, locked editing, persisted checkbox/rate values, dynamic buyer fee labels/totals, existing bid confirmation behaviour, offline/stale-price protection, and no overflow or browser exceptions. Images were visually reviewed at all three widths.

Run `node scripts/check-auction-fees-ui.mjs` and `node scripts/check-bid-entry-ui.mjs` against the local Docker preview after its API is healthy.

**MONEY/BID CHANGE — needs human review.** See [the contract](../../specs/auction-fee-controls.md).
