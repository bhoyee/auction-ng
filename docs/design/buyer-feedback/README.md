# Buyer action feedback and session recovery

Item-detail browser fixtures exercise accepted bids, rejected preparations,
uncertain confirmation responses, successful watch actions and failed watch
actions at 360, 768 and 1280 px. Green/red toast colours, close controls and the
bold green live winning banner are checked. Screenshots are in this directory.
No real bids, holds, payments or watch mutations are submitted.

Run:

```powershell
node --import ./apps/api/node_modules/tsx/dist/loader.mjs scripts/check-buyer-feedback-ui.mjs
node scripts/check-wallet-workspace-ui.mjs
pnpm exec vitest run tests/web-session-renewal.test.ts tests/web-bid-operation.test.ts --coverage.include=apps/web/lib/session-renewal.ts
```

The wallet browser checks also expire all three concurrent authenticated reads,
verify one renewal, preserve the entered amount, and open a second same-origin
tab to verify token adoption without another refresh rotation. Genuine 503
failures still show red notices and recover after successful reads. Updated
wallet screenshots are in `../wallet-workspace`.

This fixes reproducible client-side expiry/renewal gaps. It does not establish
that every earlier warning had that cause; unavailable servers or real network
failures must still be reported. The silent fifteen-second refresh stays enabled.

Relevant lint/formatting, web/UI types, all fourteen focused unit tests (100%
renewal-helper coverage), both responsive browser checks and the web production
build pass. Server authentication policy, bid acceptance,
idempotent retry semantics, fees and ledger behavior remain unchanged.
