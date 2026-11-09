# Entered bid amounts and signed-in bidding form

**MONEY/BID CHANGE — needs human review**

Owner-approved 2026-11-01: an entered bid or automatic limit must meet the starting price before the first bid. Once a current price exists, it must be strictly higher than that price. There is no tier-sized minimum or multiple requirement for the submitted amount. Money remains safe integer kobo: the smallest higher amount is one kobo (₦0.01). Equal and lower amounts are rejected.

| Current state                | Submitted amount | Result                                           |
| ---------------------------- | ---------------- | ------------------------------------------------ |
| No bids; starting price ₦500 | ₦499.99          | Reject                                           |
| No bids; starting price ₦500 | ₦500             | Accept                                           |
| Current bid ₦12,500          | ₦12,500          | Reject                                           |
| Current bid ₦12,500          | ₦12,500.01       | Accept, subject to eligibility/funds/open status |
| Current bid ₦12,500          | ₦13,217.50       | Accept; no round-number or multiple requirement  |

The owner explicitly retained the existing automatic counterbid step table. That table determines how an existing automatic commitment responds to another buyer; it does not set the minimum entered amount. Private maxima, earlier-wins equal maxima, explicit opt-in to automatic bidding and the prohibition on reducing an active commitment remain unchanged. An existing automatic leader can still counter an accepted direct bid and remain the leader.

## Enforcement

`MIN_BID_INCREASE_KOBO` and `minNextBid()` in `packages/shared/src/auction-rules.ts` define entered-bid validation. API preparation, the shared mixed-mode resolver and buyer/watchlist minimum displays use that function. The atomic Redis Lua script imports the same constant for confirmation-time checks, while retaining the automatic increment table for counterbids. Stale preparations cannot bypass a newer displayed price.

Wallet reservations, exact fee arithmetic, immutable operation keys, Redis atomic acceptance, soft close, persistence, invoice creation, purchase fences and settlement rules are unchanged. Two competing direct bids for the same next amount cannot both become accepted price updates. The rejected bidder's reservation is reconciled through the existing ledger service.

No database migration or environment variable is required. Deploy API, realtime, worker and browser builds together so client and server minimum displays agree; do not rewrite existing bids, commitments or ledger entries.

## Form

The signed-in detail panel presents a native radio group before the amount field. Bid full amount is the default; Automatic spending limit requires an explicit selection. The whole radio label is clickable. The three suggested-price buttons are removed. The custom amount field has a fixed Naira prefix, with Bid now (or Set limit) beside it, including at 360 px.

The first action opens the existing fee review; it does not immediately send a paid bid. The review retains item amount, premium, lot fee, VAT and total reserved before the final confirmation. The live minimum, eligibility, balance, offline/stale-price and pending-operation guards remain in place. An uncertain request keeps its original amount, mode and idempotency key.

The mobile sticky shortcut focuses the amount input without overwriting the buyer's draft or opening review for a different amount. While the sticky bid bar is present, floating support controls sit above its reserved space so they cannot intercept the bid action.

## Validation

New tests were first observed failing against the old rule. Focused tests cover the first-bid floor, one-kobo/arbitrary increases, equal/lower rejection, own commitments and unchanged automatic counterbid steps. Redis/shared parity and funded concurrency tests cover the atomic boundary and losing-hold release. Bid funding, persistence, closing and purchase tests exercise the affected settlement path with an isolated database and synthetic providers; live payment endpoints are never called.

`scripts/check-bid-entry-ui.mjs` uses an actual demo detail page with synthetic authenticated API/socket fixtures. It checks radio default/order/full-label selection, no suggestions/dropdown, input/button alignment, non-multiple kobo amounts, review before transport, exact immutable submission, live-price/offline disabling and first-bid floor at 360, 768 and 1280 px. See [screen review](../design/lot-bid-entry/README.md).
