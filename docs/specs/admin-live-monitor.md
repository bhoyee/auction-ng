# LotVanta Live monitor

Owner approved implementation and use of the supplied logo on 2026-11-07. The reference is docs/design/admin-live.png; Auction NG text in that image is obsolete. Reuse the existing staff shell, search, notifications and account menu. No auction sessions exist. Each lot retains its own original configured run time; deadline extensions are separate.

Owner confirmed freeze semantics: individual/global pause freezes auction clocks and closing; global pause holds scheduled launches. Resume preserves remaining time. Existing payments continue reconciling under their existing reservations. Existing pre-bid rules remain: a required change to launch time cancels affected pre-bids, releases their funds and notifies buyers. No paid/settled purchase may be cancelled through a live control. Whole-auction cancellation is distinct from paid buyer-consented bid cancellation; it charges no buyer cancellation fee.

All controls need current capabilities, reason, durable idempotency and audit records. Critical actions fence bidding, purchases, launch and closing before changing durable state. No ledger writes outside the ledger service. Public/private maxima never enter monitor DTOs. Money/bid control changes require integration/concurrency tests and human review.

Stats and current rows use a dedicated Redis projection outside the guarded bid namespace. The protected staff room shares the existing notification connection. Clients derive time from server samples plus monotonic elapsed time; missing/stale samples hide active values and disable controls. Price flashes/pulses respect reduced motion. Only visible table rows render and loaded rows are paginated at 50 or fewer per request.

Issue tracking is measured, not fabricated: unavailable periods are explicit. Historical run time or buyer area without a trusted source remains unavailable. Watchers means saved watchlists. Online buyers are distinct authenticated buyers across devices. Just closed uses confirmed outcomes, with payment-pending distinguished from paid Sold and no winner inferred solely from client countdown expiry.

## Implementation checkpoint

The initial foundation adds strict shared contracts, a monotonic server clock, credential-isolated shared Socket.IO ownership and an accepted-stream bid metrics projection. The projection commits its cursor and counters atomically with compare-and-set, validates complete batches before writing, excludes private maxima and raw buyer identifiers, retains three-day counters and calculates day boundaries in WAT. Its daily peak persists after leaving the 60-minute chart. Malformed events stop projection progress instead of being silently skipped.

The read path is now integrated: `/staff/live-monitor/{summary,lots,series,issues,closed,filters}` validates the current staff session and capabilities, and reads Redis only after authorization. A separate one-second BullMQ queue calls the private token-checked `/internal/analytics/live-refresh` endpoint. The protected `admin:live` room shares the existing staff-bell socket. Buyers cannot join; revocation is checked before dispatch. Immediate price patches exclude buyer identifiers and private limits. Reconnects resynchronise the panels, and stale server-clock samples grey active values.

The supplied logo and existing grouped shell are reused. Six cards, virtualised closing rows, filters, a 60-minute chart/table/CSV alternative, issue states and paginated closed outcomes are implemented. Original run time is captured by a database trigger on first publication and cannot be rewritten when deadlines extend. Existing uncertain durations stay unavailable. Bid-history inspection requires a typed reason, current permission and a durable idempotent audit record before navigation.

Redis publication uses atomic changed-row deltas and category/location sorted indexes. A 3,000-row unchanged refresh emits only three small commands, rather than rewriting full tables into the durable Redis log. Revision compare-and-set prevents stale producers overwriting newer data. Closed rows update individually. Current server-time markers expire after 12 seconds, so old cached data cannot masquerade as live.

## Local demo and validation

**MONEY/BID CHANGE — needs human review:** the demo simulator creates traceable fixture funding through LedgerService and submits real test bids. Its database, namespace and reserved-email guards must remain intact. It changes no production fee, acceptance or settlement rule.

From PowerShell in the repository root, with the existing local Docker demo running:

```powershell
docker exec -e NODE_ENV=development auction-ng-api-1 pnpm --filter api demo:live
docker exec -e NODE_ENV=development auction-ng-api-1 pnpm --filter api demo:live:bids --count=40 --per-minute=120
```

The seed is append-only and refuses production mode, non-demo databases and mismatched namespaces. It reuses the existing credited, vendored demo photos and preserves condition grades. It creates twenty independently timed lots with original 12/24/36/48/72-hour durations and staggered near-term closing times. Repeating the initial seed does not retime existing lots; add `--new-batch` explicitly to append another fresh group. Existing auction history is retained.

The simulator uses dedicated `demo-live-buyer-…@example.test` accounts, normal password/email-code authentication and normal bid/hold/persistence services. Its synthetic funding goes through LedgerService with stable per-user receipts; rerunning cannot credit those fixture top-ups twice. It never funds ordinary customer accounts or calls Paystack. Existing security/rate limits remain in force, so allow their windows between repeated runs. Run `--count=400 --per-minute=400` for the load sample. The local validation accepted 400/400 with confirmation p95 15.66 ms; this is a local demo measurement, not a production-capacity guarantee or a combined 3,000-live-lot benchmark.

Targeted browser checks cover independent errors, empty states, pagination rendering and screenshots at 360/768/1280/1440/1920 pixels. The screenshot harness uses clearly documented synthetic responses; actual runtime data comes from the application's records. See `docs/design/admin-live-monitor/README.md`.

## Still open

Silent-refresh correction (2026-11-08): retry a failed monitor-room acknowledgement on the existing shared transport, cancel retries on disposal, reconcile panels after price patches and refresh when the browser regains focus. Keep the five-second silent fallback and preserve confirmed content while requests run. A targeted Chromium regression changes a row price and removes a confirmed-closed row without navigation or reload; client/admin types, changed-file lint, socket tests and the admin production build pass. The local admin container has the updated build.

Presence checkpoint (2026-11-08): authenticated buyer sockets now maintain 15-second Redis leases, deduplicated across devices using opaque buyer hashes. The online/bid-today counts intersect those leases with the accepted-bid projection. Unexpected transport disconnects recovered within five seconds increment an atomic WAT-day counter once; intentional sign-outs do not. Missing, stale or malformed telemetry remains unavailable. Telemetry failures never disconnect the price gateway or alter a bid/payment. Four isolated Redis presence tests, eight projection tests and two protected-gateway tests pass; API/realtime types and production builds pass. The running local API returns healthy and its configured presence heartbeat is fresh.

Pause/resume, extension, whole-lot cancellation and bidder messaging remain disabled. Their durable approval records, Redis fences, recovery integration, buyer pause rendering and concurrency tests must be completed before enabling them. Insufficient-wallet and release-failure telemetry are not yet implemented; those fields show unavailable rather than invented zeroes. Late-close counts come from confirmed settlement timestamps. Full combined production-volume validation and final authenticated visual review remain open. This task is not complete.
