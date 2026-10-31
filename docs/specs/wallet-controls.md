# Marketplace wallet controls

2026-10-31. MONEY/BID CHANGE - needs human review.

Owner-approved scope: independent marketplace-wide switches for new wallet deposits and withdrawal requests. No per-buyer blocking. Existing requests keep reconciling and settings changes never move wallet money.

## Behaviour

- New card/one-time transfer funding quotes and hosted checkout intents are rejected with HTTP 503 while deposits are paused. New DVA consent/assignment is also gated; already assigned accounts or consented assignments continue to reconcile. Previously started payments and unsolicited transfers into existing accounts must still be credited after provider verification. A pause cannot stop a bank transfer externally sent to an existing account.
- Admission occurs when the local payment intent or withdrawal draft is committed. Exact retries of an existing intent remain available after pausing; original fee/amount/request contracts are still enforced.
- A withdrawal pause rejects new quotes/drafts and disables the buyer entry button. Existing draft email confirmation, finance review, cancellation, sent transfers, webhook handling, history and settlement continue. No holds are released and no request is marked failed by a pause.
- Existing environment/provider safety gates remain in force. Enabling the admin setting cannot enable a server-disabled withdrawal service or configure missing payment credentials. Fixed-price purchase checkout and bidding rules are outside these wallet-funding switches.

## API and security

- GET /wallet/controls: authenticated buyer, no-store, read rate limit.
- GET /admin/wallet-controls: authenticated admin, no-store, read rate limit.
- POST /admin/wallet-controls: authenticated admin, strict Zod request, mutation rate limit. Fields: depositsEnabled/withdrawalsEnabled (boolean), expectedRevision (integer), reason (5-240 characters), idempotencyKey (UUID). Shared schemas power Swagger and the typed API client.
- Require an active admin again inside the update transaction and lock their user row. A settings-wide exclusive advisory lock serializes updates; admission uses the corresponding shared lock through intent commit. Global admission precedes buyer locks, avoiding deadlocks between deposits, withdrawals and pause operations.
- Optimistic revision prevents stale edits. Existing idempotency_keys records bind actor/key to the request hash and encrypted exact response; replay cannot apply a second update or silently accept changed payloads. An encrypted before/after audit_log row records actor, reason and revision once per successful request.

## Database

Migration 20261031000200_wallet_controls creates wallet_controls with one seeded enabled row. Columns: id SMALLINT primary key (CHECK id=1); deposits_enabled BOOLEAN NOT NULL DEFAULT TRUE; withdrawals_enabled BOOLEAN NOT NULL DEFAULT TRUE; revision INTEGER NOT NULL DEFAULT 0, CHECK 0 <= revision < 2147483647; updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP. No foreign keys or additional unique constraints are needed for a singleton. Primary-key lookup covers the only query pattern; no list endpoint or N+1 queries. Existing audit/idempotency relations and unique keys are reused. Full catalog: [database dictionary](database-schema.md).

## UI and validation

Admin controls appear above Top Deals at localhost:3301, only for the admin role. Each change requires a reason and review confirmation. Buyer funding fields/actions and the withdrawal button fail closed while availability is unknown, stale after a failed refresh, or paused. Poll silently every 15 seconds and on focus/reconnect; API enforcement applies as soon as the pause commits. Existing recovery actions and tables remain available.

Affected deposit, withdrawal and control integration tests include new-request admission races, exact retries, verified credit after pause, existing withdrawal completion, role rejection, audit, revision conflict and duplicate settings saves. Dedicated test databases keep global settings fixtures separate from other suites in CI; no checks or coverage rules are disabled. Responsive admin/buyer review: [screenshots](../design/admin-wallet-controls/README.md). No new dependency or production environment setting.
