# LotVanta Live monitor

Owner approved implementation and use of the supplied logo on 2026-11-07. The reference is docs/design/admin-live.png; Auction NG text in that image is obsolete. Reuse the existing staff shell, search, notifications and account menu. No auction sessions exist. Each lot retains its own original configured run time; deadline extensions are separate.

Owner confirmed freeze semantics: individual/global pause freezes auction clocks and closing; global pause holds scheduled launches. Resume preserves remaining time. Existing payments continue reconciling under their existing reservations. Existing pre-bid rules remain: a required change to launch time cancels affected pre-bids, releases their funds and notifies buyers. No paid/settled purchase may be cancelled through a live control. Whole-auction cancellation is distinct from paid buyer-consented bid cancellation; it charges no buyer cancellation fee.

All controls need current capabilities, reason, durable idempotency and audit records. Critical actions fence bidding, purchases, launch and closing before changing durable state. No ledger writes outside the ledger service. Public/private maxima never enter monitor DTOs. Money/bid control changes require integration/concurrency tests and human review.

Stats and current rows use a dedicated Redis projection outside the guarded bid namespace. The protected staff room shares the existing notification connection. Clients derive time from server samples plus monotonic elapsed time; missing/stale samples hide active values and disable controls. Price flashes/pulses respect reduced motion. Only visible table rows render and loaded rows are paginated at 50 or fewer per request.

Issue tracking is measured, not fabricated: unavailable periods are explicit. Historical run time or buyer area without a trusted source remains unavailable. Watchers means saved watchlists. Online buyers are distinct authenticated buyers across devices. Just closed uses confirmed outcomes, with payment-pending distinguished from paid Sold and no winner inferred solely from client countdown expiry.

## Implementation checkpoint

The initial foundation adds strict shared contracts, a monotonic server clock, credential-isolated shared Socket.IO ownership and an accepted-stream bid metrics projection. The projection commits its cursor and counters atomically with compare-and-set, validates complete batches before writing, excludes private maxima and raw buyer identifiers, retains three-day counters and calculates day boundaries in WAT. Its daily peak persists after leaving the 60-minute chart. Malformed events stop projection progress instead of being silently skipped.

This checkpoint does not enable pause/cancel controls or change bidding, closing, payments or ledger execution. API routes, protected monitor room, projection scheduling, presence/issue instrumentation, original run-time snapshots, full UI, operational controls, simulator and visual/load validation are still required. The current dashboard has not been replaced by this foundation.
