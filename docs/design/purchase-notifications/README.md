# Purchase feedback and notification review

Captured and checked at 360, 768 and 1280 px. Browser responses are isolated
fixtures; no real purchases, payments or wallet debits are submitted.

Run with the local buyer site/API available:

```powershell
node --import ./apps/api/node_modules/tsx/dist/loader.mjs scripts/check-purchase-notifications-ui.mjs
```

Cases: wallet purchase success, uncertain retries retaining the same request key,
insufficient balance, pending card reservation turning into a confirmed purchase
through silent polling, late payment credited only to the wallet, red bell count,
owned pickup shortcut, read acknowledgements and wallet/purchase return feedback.
Menus stay inside the viewport; the whole page never scrolls horizontally.

`purchase-success-*`, `purchase-error-*` and `bell-*` screenshots show the states.
`review.json` records completed checks. The focused buyer API suite also verifies
authentication, private metadata, read acknowledgements, validation and the
paid/uncollected/owned pickup-count filters against an isolated migrated database.

All fourteen focused buyer API tests, the responsive purchase/bell checks,
existing payment-return checks, API/web production builds and affected
lint/formatting/type checks pass.
Unrelated full-site, money and bidding suites remain outside this UI/read task.
