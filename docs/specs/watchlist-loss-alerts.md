# Saved auction loss alerts

The owner confirmed that a saved item sold to another buyer leaves Watching and
its active count, but remains in Lost history. No watch row is deleted on close.
Buyers who bid without saving the item do not receive this watchlist alert.

The existing internal closing-worker endpoint runs a separate result scan before
email delivery. It reads closed lots and paid invoices, locks at most fifty saved
rows with `FOR UPDATE SKIP LOCKED`, and atomically records handled results and
encrypted `watch-lost-v1` notices. The unique notification reference is
`watch-lost:{lotId}:{userId}`. Concurrent jobs and normal retries do not create
duplicate in-app notices. Winner, unsold, defaulted, unpaid and after-close saved
items do not produce a false loss email. Payment and ledger code are unchanged.

The bell's existing owned, cursor-paginated notification APIs include the new
template, unread counts and read acknowledgements. The destination is a validated
relative `/lots/{UUID}` URL. No recipient, winner identity, encrypted payload or
private bid limit is returned. `GET /buyers/watchlist/count` now counts active
Watching items using the same ownership/outcome predicate as that tab. The
existing typed clients and Swagger response schemas cover these responses.

Visible pages reconcile silently every fifteen seconds and on focus/online.
Successful bell refreshes also request an active-count refresh, without changing
saved membership or erasing Lost history. Offline reads never fabricate a zero.

Mail uses the existing SMTP/Mailpit adapter and a branded HTML/text template from
shared design tokens. The stable provider idempotency key is
`auction-ng/notification/{id}`. Delivery failures retain pending records for retry;
ordinary SMTP cannot guarantee recipient-side exactly-once delivery after an
ambiguous network failure. In-app notices remain available independently of email
delivery. Missing recipient addresses mark email failed without hiding the notice.

Migration `20261030000300_watch_result_alerts` adds nullable
`watchlist.result_handled_at` and the partial index
`watchlist_pending_result_idx(lot_id,user_id) WHERE result_handled_at IS NULL`.
Existing closed watches are marked handled, retaining history without sending old
loss mail. No environment variables or dependencies are added. The generated
database dictionary documents the new column and index.

Targeted verification: six isolated database/email tests, including concurrent
queue/delivery, replay, active count, retained history, owner-only read status,
unsold/pending/late exclusions, safe email rendering and bounded batches; fourteen
affected buyer API tests; API/web type checks and production builds; browser
checks at 360, 768 and 1280 pixels. No external payment or email was sent by tests.
