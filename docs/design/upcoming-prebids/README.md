# Upcoming Deals and pre-bidding

Preview: http://localhost:3300/upcoming-deals. Staff scheduling: http://localhost:3301/ after staff sign-in.

| Screen | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Upcoming list | [Phone](upcoming-360.png) | [Tablet](upcoming-768.png) | [Desktop](upcoming-1280.png) |
| Signed-out detail | [Phone](anonymous-detail-360.png) | [Tablet](anonymous-detail-768.png) | [Desktop](anonymous-detail-1280.png) |
| Fee confirmation | [Phone](fee-review-360.png) | [Tablet](fee-review-768.png) | [Desktop](fee-review-1280.png) |
| Saved private limit | [Phone](saved-detail-360.png) | [Tablet](saved-detail-768.png) | [Desktop](saved-detail-1280.png) |
| Connection retry | [Phone](retry-360.png) | [Tablet](retry-768.png) | [Desktop](retry-1280.png) |
| Staff schedule | [Phone](admin-schedule-360.png) | [Tablet](admin-schedule-768.png) | [Desktop](admin-schedule-1280.png) |

Automated browser checks: `node scripts/check-upcoming-prebids-ui.mjs`, using local demo SSR data and synthetic authenticated browser responses. No real buyer credentials, email delivery or money movement. [Results](checks.json).

Checks cover fee disclosure, save/edit/cancel, insufficient-funds correction, exact idempotent retries after uncertain results, pending-input locking, private/public states, staff reschedule/cancel, page errors and overflow. Visual review uses existing brand tokens/components and licensed demo photos; launch timers remain indigo and fit narrow cards. Full-page detail captures include existing policy/condition/pickup sections.

An additional unfunded demo fixture verified the actual API/worker transition while the browser stayed open: [launch result](launch-check.json), [live detail](automatic-launch-1280.png). No manual refresh, payment or ledger mutation was used for that check.

MONEY/BID CHANGE - needs human review before production.
