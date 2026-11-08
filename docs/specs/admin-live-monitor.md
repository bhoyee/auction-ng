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

## Global controls and bidder messages (2026-11-08)

**MONEY/BID CHANGE — needs human review.** Global pause/resume and per-item bidder messaging are connected. Individual pause, extension and whole-item cancellation remain disabled.

Only an active administrator can pause/resume all bidding. Existing session checks enforce authenticator proof when that account has enabled it. The dialog requires a reason, current control revision and typed PAUSE/RESUME confirmation. A durable command and encrypted audit input commit before Redis changes. Exact retries replay the original action; a partial unique index permits one unfinished command per namespace.

The Redis fence serializes pause against acceptance, new Buy Now reservations, closing and scheduled launches. Accepted retries, existing purchase reservations and reconciliation remain valid. Pre-bid cancellation remains available. Bidding stays fenced through the entire restoration. Per-item plans commit before Redis deadlines change; interrupted SQL writes reuse the same Redis receipt. Final compensation includes time spent restoring clocks, and SQL deadlines commit before the global fence opens. Expired/closed items never reactivate. Original configured run time stays immutable. Schedule changes invalidate pre-bids through the existing free release/notification workflow; partially started launches retain their funded preparation clocks. Publication/rescheduling and unsold relisting cannot race the restoration cursor.

Closing and operator recovery verify accepted deadlines against durable applied restoration records. Recovery fingerprints include control history and Redis receipts; unfinished/inconsistent controls require review. Buyer sockets carry the frozen server-clock point, disable new bids/Buy Now and show the pause. Opaque revision heartbeats recover missed control signals without requesting every lot on every heartbeat.

Staff with auction-management permission can message an item’s bidders, including outbid buyers. The accepted stream drains to a server-time cutoff before queuing. A durable encrypted outbox processes distinct eligible buyers fifty at a time; cursor advancement and notification insertion share a transaction. Retries and concurrent dispatches cannot duplicate recipients. Messages appear in buyer notifications, queue an escaped branded email and enter the existing enabled-device push pipeline. Local email remains preview delivery, as previously approved. Messages change neither bids nor funds.

Focused SQL/Redis tests cover audit/idempotency/permissions, held funds, schedule invalidation, interruption after Redis but before SQL, settlement after resume and operator recovery. Lua tests race bids against pause, preserve existing payment completion, prevent expired-item resurrection and restore 3,000 clocks (53.43 ms locally; not a production-capacity guarantee). Adjacent bid/purchase/pre-bid/cancellation/closing/recovery regressions ran; reused-database ciphertext and unrelated unfinished-fixture failures were rerun in clean isolated databases without weakening checks. Seven browser checks pass; the expanded pause/resume and message flows also pass with responsive captures. Affected production builds pass.

Silent-refresh correction (2026-11-08): retry a failed monitor-room acknowledgement on the existing shared transport, cancel retries on disposal, reconcile panels after price patches and refresh when the browser regains focus. Keep the five-second silent fallback and preserve confirmed content while requests run. A targeted Chromium regression changes a row price and removes a confirmed-closed row without navigation or reload; client/admin types, changed-file lint, socket tests and the admin production build pass. The local admin container has the updated build.

Presence checkpoint (2026-11-08): authenticated buyer sockets now maintain 15-second Redis leases, deduplicated across devices using opaque buyer hashes. The online/bid-today counts intersect those leases with the accepted-bid projection. Unexpected transport disconnects recovered within five seconds increment an atomic WAT-day counter once; intentional sign-outs do not. Missing, stale or malformed telemetry remains unavailable. Telemetry failures never disconnect the price gateway or alter a bid/payment. Four isolated Redis presence tests, eight projection tests and two protected-gateway tests pass; API/realtime types and production builds pass. The running local API returns healthy and its configured presence heartbeat is fresh.

## Remaining work

Individual pause/resume, extension and whole-lot cancellation remain disabled and need their own tested fences and approvals. Insufficient-wallet and release-failure telemetry remain unavailable rather than invented zeroes. Late-close counts use confirmed settlements. Combined production-volume validation and final authenticated visual review remain open. T15d is not complete.
