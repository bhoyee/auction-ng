# Signed-in lot bidding entry

**MONEY/BID CHANGE — needs human review**. The owner approved any entered amount strictly higher than the current bid, or at least the starting price before the first bid. Existing automatic counterbid steps remain. Full rules: [bid-entry.md](../../specs/bid-entry.md).

Native radio options appear above the custom Naira input. Bid full amount is selected by default. Bid now sits beside the input and opens the fee review; the three suggested-price buttons and bidding-method dropdown are removed. Selected radio cards use the shared indigo surface/border, visible focus and whole-label click targets. Amounts and modes remain locked while an operation is unresolved.

| State | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Custom direct bid | [View](bid-entry-360.png) | [View](bid-entry-768.png) | [View](bid-entry-1280.png) |
| Fee review | [View](fee-review-360.png) | [View](fee-review-768.png) | [View](fee-review-1280.png) |

The focused Playwright script uses synthetic sessions, balances and socket responses; preparation/confirmation requests are intercepted and do not place real bids or move demo funds. It uses actual demo product photography and the production detail-page build. Sticky navigation and the chat launcher are hidden only for the component screenshot so they do not obscure the form.

Targeted lint/formatting/types and affected production builds accompany the browser check. Bid-rule unit tests and the isolated auction integration suite cover the changed shared/Lua validation and concurrency. Unrelated withdrawal, support and full-site suites are outside this change.
