# Staff-approved bid cancellation

Buyer request flow: reason and explicit fee consent; requesting review is free. The fee basis is the auction service percentage on the public bid price at approval. After staff complete cancellation, the buyer cannot bid on this item again. Pre-launch pre-bid cancellation remains free.

Admin support desk: consent gate, current fee quote, leader/non-leader effect, reason and filled red confirmation. Uncertain responses retain the exact request/key. Completed approval is distinguished from ordinary conversation resolution.

| Screen | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Buyer fee consent | [Phone](confirmation-360.png) | [Tablet](confirmation-768.png) | [Desktop](confirmation-1280.png) |
| Cancelled buyer | [Phone](cancelled-buyer-360.png) | [Tablet](cancelled-buyer-768.png) | [Desktop](cancelled-buyer-1280.png) |
| Admin quote | [Phone](admin-quote-360.png) | [Tablet](admin-quote-768.png) | [Desktop](admin-quote-1280.png) |
| Admin confirmation | [Phone](admin-confirmation-360.png) | [Tablet](admin-confirmation-768.png) | [Desktop](admin-confirmation-1280.png) |
| Admin completed | [Phone](admin-completed-360.png) | [Tablet](admin-completed-768.png) | [Desktop](admin-completed-1280.png) |

Browser scripts: `node scripts/check-bid-cancellation-ui.mjs --paid-cancellation` and `node scripts/check-paid-bid-cancellation-ui.mjs`. These use synthetic browser authentication/responses against local demo SSR pages; no actual cancellation or payment is made. [Buyer checks](checks.json), [admin checks](admin-checks.json).

Checked: reason/fee acknowledgement, binding notice and Bid now retained before cancellation, blocked bidding afterwards, current quote/rate, legacy consent gate, explicit staff confirmation, exact retry and pending-field locking, status reconciliation, no page errors/overflow. Screens follow shared tokens and responsive controls. Lint/types, affected builds and applicable money/concurrency regressions pass.

MONEY/BID CHANGE - needs human review before production.

Correction: buyer fee disclosure renders 1500 basis points as 15%, uses support team wording, and removes the request panel/dialog after completed cancellation. The browser check sends a live socket update on the already-open page and requires removal within three seconds, without navigation or manual refresh. Five-second silent polling remains a fallback.

Outbid correction: only the confirmed current leader sees the review panel. Live outbid updates hide the panel and close any open dialog, including when the private history response still reports an accepted bid. A fresh lead restores the action; disconnected/stale state hides it. Browser coverage checks these transitions without refresh or financial writes. Outbid screenshots: [360](outbid-no-request-360.png), [768](outbid-no-request-768.png), [1280](outbid-no-request-1280.png).
