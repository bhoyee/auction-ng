# Item detail and public bid history

Preview: http://localhost:3300/lots/05e52ad9-de99-43d4-b2ad-5167c71994f4

- Full pages: [phone](page-360.png), [tablet](page-768.png), [desktop](page-1280.png).
- Public populated history: [phone](public-history-360.png), [tablet](public-history-768.png), [desktop](public-history-1280.png).
- Personal history: [phone](your-bid-360.png), [tablet](your-bid-768.png), [desktop](your-bid-1280.png).

The price panel includes the friendly item reference, top-right watch/share controls, bold red estimate comparison, bold Buy Now and join hover/focus feedback. Real demo live price/countdown remain authoritative; the synthetic authenticated history fixture intentionally uses its own database and cannot authenticate to the separate running demo socket gateway.

Winning Bid shows all recorded leading-price events in newest-first cursor pages. Buyer aliases are stable within a lot; no name, email, account identifier or private maximum is public. Your Bid is disabled for guests and reads only the signed-in buyer's requests for this item. Account/view changes immediately hide the previous scoped response. History refreshes every fifteen seconds while visible and on reconnect/focus. WAT dates and times remain visible through internal table scrolling on narrow phones. Green/crown means latest recorded leader, not a settled winner.

Focused verification:

- Eight buyer API tests plus the privacy test, including anonymous access, unknown/oversized query rejection, missing lots, authentication and owner/lot isolation.
- Populated public/private browser checks at 360/768/1280: accepted automatic bid persists, its private maximum never appears publicly, personal row appears only when signed in, public history still includes the same bid and guest Your Bid is disabled.
- Real demo live-detail browser checks: no page overflow, Item ID and actions in the bidding panel, red percentage, bold Buy Now and changed join hover background.
- Changed-file ESLint/format checks, API/web/UI type checks and API/web production builds. Full-site/money suites were not rerun; acceptance, hold, fee and settlement rules were not changed.

Reproduce the focused checks in PowerShell after installing dependencies and starting local services:

```powershell
node scripts/check-admin-top-deals.mjs --history-only
pnpm --filter api build
node --import ./apps/api/node_modules/tsx/dist/loader.mjs scripts/check-purchase-ui.mjs --history-only
node scripts/check-lot-detail-ui.mjs --history
```

Fixture databases are retained; no application records are deleted. The new migration adds only the owner/lot/history lookup index. T13's broader loading-budget and owner-review gates remain open.
