# Buyer portal review

Owner-requested signed-in redesign, 2026-10-29. The sidebar follows the supplied reference with Auction NG indigo/yellow branding and the requested navigation. No Transfers, referral, rewards or invented earnings screens.

Preview: open http://localhost:3300/account after signing in, or /wallet for Balance. Phone/tablet use the My account button; desktop has a collapse control. The local API and web containers have been updated.

## Screenshots

| Screen | Phone | Tablet | Desktop |
| --- | --- | --- | --- |
| Balance | [360](wallet-360.png) | [768](wallet-768.png) | [1280](wallet-1280.png) |
| Profile | [360](account-360.png) | [768](account-768.png) | [1280](account-1280.png) |
| Awaiting pickup | [360](awaiting-pickup-360.png) | [768](awaiting-pickup-768.png) | [1280](awaiting-pickup-1280.png) |
| Check-in | [360](check-in-360.png) | [768](check-in-768.png) | [1280](check-in-1280.png) |
| Shipments | [360](shipments-360.png) | [768](shipments-768.png) | [1280](shipments-1280.png) |
| Watchlist | [360](watchlist-360.png) | [768](watchlist-768.png) | [1280](watchlist-1280.png) |
| Buy Now purchase history | [360](purchase-history-360.png) | [768](purchase-history-768.png) | [1280](purchase-history-1280.png) |
| Bid history | [360](my-bids-360.png) | [768](my-bids-768.png) | [1280](my-bids-1280.png) |
| Customer service | [360](customer-service-360.png) | [768](customer-service-768.png) | [1280](customer-service-1280.png) |

[Phone menu](menu-360.png), [tablet menu](menu-768.png), [collapsed sidebar](collapsed-1280.png). Screenshots contain synthetic isolated test records, not live customer balances or transactions.

## Targeted validation

- API and web type checks and production builds pass.
- ESLint and Prettier pass for changed TypeScript, React, browser script and CSS files.
- Ten focused buyer/history tests pass: authentication, owner isolation, secret omission, scoped cursor pagination, Buy Now-only orders and outstanding pickup filtering; read endpoints do not write ledger entries.
- Browser review covers nine portal pages at 360/768/1280, no horizontal overflow or browser exceptions, desktop collapse, mobile menu, logout and signed-out protection. A logout redirect race found in this review was fixed.
- Existing financial operations, bid acceptance, holds, fee calculations and CI remain unchanged. No full-site or unrelated financial suites were run.

Reproduce API checks: node scripts/check-admin-top-deals.mjs --history-only

Reproduce UI checks after building the API and starting the buyer site: node --import ./apps/api/node_modules/tsx/dist/loader.mjs scripts/check-buyer-portal-ui.mjs

Check-in displays private pickup passes; collection confirmation remains a staff action. Shipments explains delivery is not available yet. Overall T13 acceptance and its existing loading-budget work remain open.
