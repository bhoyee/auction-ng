# Purchase history review

Owner-requested refinement, 2026-11-01. Purchase history remains Buy Now purchases only; invoice ownership, payment rules and collection eligibility are unchanged. Pickup deadlines remain deferred to T16.

Use a full-width bordered order list instead of generic activity cards. Show friendly order references, Lagos dates, actual payment status badges, bold recorded Naira totals and explicit invoice links. Green Paid includes a tick, Cancelled is red and Refunded uses pale indigo. Stack each order into two columns on phones, with visible totals and invoice actions. Use ten-row cursor navigation and owner-scoped silent refresh that retains loaded rows during transient errors.

| Screen | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Orders | [Mobile](orders-360.png) | [Tablet](orders-768.png) | [Desktop](orders-1280.png) |
| Refresh error | [Mobile](error-360.png) | [Tablet](error-768.png) | [Desktop](error-1280.png) |
| Empty | [Mobile](empty-360.png) | [Tablet](empty-768.png) | [Desktop](empty-1280.png) |

Screenshots use synthetic authenticated buyer/order fixtures. No real purchase, payment or customer data was created. The list endpoint supplies invoice summaries, so the design does not invent item photos, item names or collection statuses.

`scripts/check-purchase-history-ui.mjs` passes at all three widths: aligned rows, paid/refunded/cancelled badges, bold totals, correct invoice links, ten-row cursor pagination, no horizontal overflow, retained rows after refresh failure and retry/empty states. Affected ESLint/Prettier checks, UI/web TypeScript and the buyer production build pass. No unrelated full-site, payment or bidding tests were run.
