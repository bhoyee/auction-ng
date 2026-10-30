# Closed auction result review

The reported lot `78d1a399-4b2b-48e3-aa13-9d2342d9f977` was already closed with a
paid settlement and paid invoice. Its final hammer price is 1,225,000 kobo
(12,250 Naira). No settlement or wallet changes were needed.

The item page had kept using a live-price subscription after the lot’s live
state was removed. It now reads an uncached public outcome and switches to
Auction closed / Sold with the paid final price. It removes bid controls and
retains history and the private pickup shortcut. Confirmed sold/unsold results
stop polling. Buy Now feedback remains mounted during the transition.

Run `node scripts/check-closed-lot-ui.mjs` with local web/API services available.
Captures cover the reported lot at 360, 768 and 1280 px. An isolated browser
fixture covers open/extended auction → closing → sold without refreshing,
removal of bid controls, and retention of the confirmed result during an outage.
No real bids or payments are submitted.

Two focused public-outcome API cases verify paid and unpaid results, unsold and
closing states, hidden/malformed requests, no caching, no private identifiers
and no ledger writes. Existing PK/unique indexes cover the bounded read.
Both focused API cases, responsive browser checks, affected lint/types, API/web
builds and the Buy Now notification regression pass. Unrelated full-site and
financial suites were not rerun.
