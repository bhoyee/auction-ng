# Live bid review requests

The item page shows the buyer’s latest accepted commitment and binding-bid notice. The reason/acknowledgement dialog sends a human-support request without changing the bid. Bid History shows the same saved conversation and status, with View request linking into customer service. Bid now remains available for valid raises.

| Screen | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Commitment | [Phone](commitment-360.png) | [Tablet](commitment-768.png) | [Desktop](commitment-1280.png) |
| Confirmation | [Phone](confirmation-360.png) | [Tablet](confirmation-768.png) | [Desktop](confirmation-1280.png) |
| Sent request | [Phone](request-sent-360.png) | [Tablet](request-sent-768.png) | [Desktop](request-sent-1280.png) |
| Bid History | [Phone](history-360.png) | [Tablet](history-768.png) | [Desktop](history-1280.png) |

Run `node scripts/check-bid-cancellation-ui.mjs` against the local preview. It uses a real demo lot for SSR and synthetic authenticated API/socket fixtures; no real money or emails are sent. [Results](checks.json).

Checks: private commitment/notice, Bid now retained, reason and acknowledgement required, exact retry after lost response, request persistence between pages, silent Open/In Progress/Resolved status refresh, no bid/payment writes, no page errors or horizontal overflow. Targeted support integration/regressions, lint/types and affected production builds pass.
