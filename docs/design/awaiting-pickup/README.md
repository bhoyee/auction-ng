# Awaiting pickup layout

Aligned Order, Payment, Amount and Collection columns in one full-width white list. Compact two-column rows on phones. Actual paid status uses a green tick badge, Naira amounts are bold, and each order links to its private pickup pass and invoice. Ten rows per cursor page with Previous/Next and visible disabled boundaries. Background reads retain loaded content and show a red retry banner on failure.

## Validation

Targeted web/UI types, changed-file lint/formatting and buyer production build pass. Mocked-browser checks at 360/768/1280px cover green Paid status, bold amounts, correct owned-order pass URLs, ten-row cursor navigation and boundaries, error recovery with retained rows, and the empty state. Tablet/desktop status and amount align vertically; no page-wide horizontal overflow. No real payment or pickup operation is performed. Backend eligibility/collection rules and other account pages are unchanged.

| Width | Orders | Refresh error | Empty |
| --- | --- | --- | --- |
| 360 | [Orders](orders-360.png) | [Error](error-360.png) | [Empty](empty-360.png) |
| 768 | [Orders](orders-768.png) | [Error](error-768.png) | [Empty](empty-768.png) |
| 1280 | [Orders](orders-1280.png) | [Error](error-1280.png) | [Empty](empty-1280.png) |

[Browser results](review.json). No full application suite was run.
