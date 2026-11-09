# Buyer refresh and access-boundary review

2026-11-01, owner requested silent updates and protection against client-side tampering.

## Updates

The legacy private-read hook now delegates to the existing owner/device/read-scoped silent refresh helper. Invoice details, invoice history and detail-page watch status therefore reconcile every fifteen seconds while visible/online, plus focus, reconnect and relevant local invalidation events. Requests do not blank loaded data or overlap within a hook lifecycle. Owner/device/read changes hide the old snapshot immediately; responses from a retired effect cannot replace the active snapshot.

Transient read failures retain the last confirmed data with an explicit error notice. Definitive 401/403/404 responses discard the protected snapshot. A late unauthorized response from an inactive read cannot clear a subsequent session. Invoice printing remains disabled during a read error; financial records are never inferred from browser values.

Sidebar balance now reconciles every fifteen seconds on account pages, on focus/online/visibility and existing wallet events. Pending payment-return verification rechecks the same owned payment ID every fifteen seconds, retaining the status card while checking; hidden/offline pages wait until active. It uses the existing idempotent confirmation endpoint and stops polling confirmed terminal results. No amount, fee, settlement, ledger or authentication rule was changed.

## Refresh coverage

| Area | Mechanism reviewed |
| --- | --- |
| Home, deal lists | Existing fifteen-second reconciliation; live lot updates/clock handling |
| Lot prices, Winning/Outbid, watched live lots | Existing Socket.IO subscriptions and stale/reconnecting handling |
| Wallet, funding/activity, withdrawals | Existing owner-scoped polling and action invalidations |
| Purchases, Bid history, Awaiting pickup | Shared fifteen-second silent reads |
| Invoice details/history, item watch state | Previously one-shot; now shared silent reads |
| Check-in pass, staff pickup queue | Existing fifteen-second reconciliation |
| Notifications/watch counts | Existing polling and mutation invalidations |
| Sidebar balance | Added timer/online/visibility reconciliation |
| Pending payment return | Added repeated verification without a manual click |
| Profile forms/static policy/help pages | Do not replace unsaved form edits or poll static copy |

Polling is bounded eventual refresh, not a claim that every screen receives an instantaneous socket event. Hidden tabs, offline devices and provider delays cannot promise immediate updates. Financial and bid decisions remain authoritative on the server.

## Security review limits

Read the existing authentication/role guards, owner-scoped buyer queries/cursors, webhook signature/provider verification and ledger locking/idempotency paths. Buyer identity comes from the authenticated session, not a client-provided owner ID; invoice lookup includes both invoice ID and owner. Server endpoints remain responsible for eligibility, balance, fees and status transitions even when a user modifies their browser UI.

Fourteen existing buyer API integration tests pass in a newly created isolated test database, covering unauthenticated reads, owner-only records, private pagination, watch mutation isolation and notification acknowledgement boundaries. No demo records were altered. This is a focused code and regression review, not a full penetration test, dependency audit or production infrastructure assessment. No claim of zero vulnerabilities is made.

## Browser checks

`scripts/check-account-refresh-ui.mjs` verifies actual timer-driven invoice changes without navigation, retained content on HTTP 503, protected data removal on HTTP 403, retry recovery and pending-to-confirmed payment updates without a manual click. Synthetic invoice/payment fixtures only; no real provider calls or money movement. Responsive captures at 360/768/1280 px:

| State | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Retained on network error | [Mobile](retained-360.png) | [Tablet](retained-768.png) | [Desktop](retained-1280.png) |
| Discarded after denied access | [Mobile](denied-360.png) | [Tablet](denied-768.png) | [Desktop](denied-1280.png) |

The affected Purchase history, Bid history and Awaiting pickup browser checks also pass. Relevant lint/formatting, buyer TypeScript and production build pass; unrelated full-site/money suites were not rerun.
