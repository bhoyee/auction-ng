# Upcoming Deals and pre-bids

Owner approved 2026-11-01:

- Upcoming Deals follows Ending soon in shopping navigation. Scheduled stock is separate from live All Deals and live search. Show the launch date/time in WAT and a launch countdown, with automatic transition when the server opens the auction.
- A pre-bid is an explicitly chosen private automatic spending limit, not an instant purchase. Reserve its estimated total through the existing ledger. Winning occurs at auction close under existing automatic counterbid and soft-close rules.
- Buyers may change or cancel before launch; a reduction/cancellation releases the appropriate reservation, and an increase requires sufficient funds. Review the total before confirmation. An edit receives a new priority timestamp; equal maxima favour the earlier committed limit.
- The first confirmed pre-bid locks the auction fee policy, including through live settlement. Keep the policy even if all pre-bids are later cancelled; existing immutable-policy guards remain intact.
- Admin cancellation releases pre-bid funds. Changing launch time cancels existing pre-bids, releases funds and notifies buyers; buyers must opt in again. A launch that has started cannot be rescheduled as an upcoming auction.
- Pre-bids are durable authorisations and survive an ordinary logout/session expiry. Recheck buyer eligibility while holding the buyer lock when activating; suspended/unverified/staff accounts cannot activate bids. Private limits are returned only to their owner.

Implementation plan:

1. Shared strict schemas/rules; additive Prisma models/indexes/constraints; isolated tests written before money behaviour.
2. Pre-bid API/service with current-session checks, idempotency, expected revisions, ledger holds/releases and immutable fee pinning. Audited admin scheduling/cancellation and encrypted notification outbox.
3. Bounded restart-safe launch batches, an atomic Redis launch gate, funded intents using existing Lua acceptance/persistence, and eligibility/cancellation race tests.
4. Typed clients and Swagger; Upcoming Deals and detail pre-bid form; staff schedule controls; real-time countdowns plus silent reconciliation; public filters exclude scheduled stock.
5. Targeted unit/integration/concurrency checks, affected builds and responsive screenshots at 360/768/1280. Update the database dictionary and task status after completion.

**MONEY/BID CHANGE — needs human review.**

Status: implemented in the local Docker preview at `/upcoming-deals`.

## API and persistence

- `GET /upcoming-lots`: public launch-ordered cursor page, maximum 50; scheduled lots only. Live browse/search exclude scheduled lots and future starts.
- `GET /lots/:id/prebid`: private owner reservation and revision, never another buyer's limit.
- `POST /lots/:id/prebid`: strict integer-kobo maximum, disclosed fee version, expected revision and UUID idempotency key; authenticated verified buyers only.
- `POST /lots/:id/prebid/cancel`: owner revision and idempotency key. Accepted live commitments cannot be cancelled through this endpoint.
- `POST /admin/lots/:id/schedule`: admin MFA/session, expected updated time, reason and idempotency key; schedule/reschedule or cancel. Times use UTC in the API and WAT in the form.

Typed contracts are in `packages/api-client/src/prebids.ts`; Nest Swagger documents each endpoint. `20261101000500_upcoming_prebids` adds the pre-bid model, owned-wallet/session/hold relations, unique reservation/intent/priority constraints, launch/reconciliation indexes and invariant guards. The generated [database dictionary](database-schema.md) lists every column, PostgreSQL type, relation, index and unique/check constraint.

Launch and invalidation reconciliation process at most 50 reservations per batch. A Redis launch fence blocks public live bids, purchases and closing until all pre-bids have entered in committed priority order. Subsequent worker ticks resume interrupted batches. Admin invalidation commits the schedule first; bounded reconciliation releases affected holds and queues notifications. Large cancellations therefore finish over subsequent ticks rather than one unbounded transaction.

Pre-bid confirmation reserves funds through the existing ledger service. Activation reuses the hold instead of charging/reserving twice, checks eligibility again and persists the original Lua acceptance idempotently. Outbid holds are released; final settlement uses the pinned fee policy. Existing invoices, private automatic maxima and money rules are preserved.

## Preview and verification

Run `node scripts/prepare-demo-upcoming.mjs` after setting up the existing local demo database. It checks the demo database/Redis namespace and adds four labelled scheduled lots using credited demo photos. Repeating it preserves existing schedules and never changes funded lots. It does not seed wallet money.

Verification: 11 isolated pre-bid API/ledger/concurrency tests; 31 closing/purchase regressions; 10 focused schema/client/email unit checks; changed-file lint/formatting, affected types and production builds. Browser workflows cover signed-out/signed-in forms, fees, edits, insufficient funds, exact retries, cancellation and admin scheduling at 360/768/1280. A real unfunded demo lot launched through the actual worker and changed the already-open browser into live bidding without a manual refresh. See [screenshots and browser report](../design/upcoming-prebids/README.md).

No dependencies or environment variables were added. Native mobile screens remain T14; the typed API contracts are available for that work. Human review of money/bid behaviour remains required before production.
