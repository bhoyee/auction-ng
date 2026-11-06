# Bid review and prominent check-in

Overview's yellow Check in a buyer action now has 18px, weight-800 text, a 56px minimum target and more padding. The Pickup desk action retains its existing compact heading size.

Bid review uses existing staff navigation, tokens, panels, badges, search and pagination. Search item references, names or buyer IDs; inspect accepted bidder records and pre-bids, with a separate schedule/item summary and frozen outcome/payment summary. Show buyer UUIDs and acceptance references for reliable verification without exposing private spending limits. Stack cards/table records on phones; retain ten-row cursor pagination and silent refresh.

Screenshots use synthetic fixtures:

| Width | Overview | Auction list | Item review |
| --- | --- | --- | --- |
| 360 | [View](overview-360.png) | [View](list-360.png) | [View](detail-360.png) |
| 768 | [View](overview-768.png) | [View](list-768.png) | [View](detail-768.png) |
| 1280 | [View](overview-1280.png) | [View](list-1280.png) | [View](detail-1280.png) |

Five focused PostgreSQL/HTTP tests and five browser checks pass. Affected lint, types and API/admin production builds pass. No bid-engine or money execution code was changed; unrelated full-site suites were not rerun. See [API and interpretation contract](../../specs/staff-bid-review.md).

Live-update follow-up: existing layouts/screenshots are unchanged. Visible live items now use public lot events to silently invalidate staff records, with throttled/persistence follow-up reads and five-second polling fallback. Four targeted client tests and two additional browser checks pass, including counts changing while the page stays open, retained filters/history and Socket.IO-protocol event delivery. Affected lint/types and admin production build pass.
