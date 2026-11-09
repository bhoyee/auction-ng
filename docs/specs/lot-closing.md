# Lot closing and invoicing

**MONEY/BID CHANGE — needs human review.** T12 adds no live payment calls or buyer screens. The existing `BIDS_ENABLED` switch controls both funded bidding and the closing worker; it remains disabled locally pending review.

## Closing boundary

The BullMQ worker calls `POST /internal/lots/close` once per second using `BID_MAINTENANCE_TOKEN`. This is a separate worker-only credential, never a buyer access token. The route accepts an empty strict body/query, is documented in Swagger and has a typed `createClosingClient`. One bounded batch examines up to 50 unfinished settlements and 50 due open/closing lots. Rotating keyset cursors prevent a broken lot or an unpaid invoice permanently blocking later work.

Redis TIME is authoritative. The close Lua script and bid Lua script serialize on the same Redis process: a final bid either commits before the freeze, including its soft-close extension, or is rejected. A future end time updates the PostgreSQL scheduling projection and keeps the lot open. A freeze records the final state, close time and a global accepted-stream barrier without deleting or trimming events. Repeating the freeze returns the same result. Test fixtures can supply a Lua clock override directly; the production API never accepts a clock.

Before freezing PostgreSQL, a contiguous closing cursor walks every accepted event through that barrier in batches of 50 and invokes the existing proof-verifying persistence implementation. Receipt insertion and cursor advancement commit together under the existing namespace lock. This includes entries that are pending or not yet delivered to the normal consumer group; its last-delivered ID alone is never treated as proof. Normal stream consumption may subsequently replay and acknowledge those same immutable receipts.

The closer validates the final persisted receipt against the frozen winner, private maximum, price and end time. Missing funding/bid state or an unknown fee policy stops settlement for review. An unwarmed expired lot may be initialized as unsold only when it has no funding intent or bid history. PostgreSQL commits the immutable `lot_settlements` result and closes the original lot before a separate transaction can charge anything.

## Money and retries

Every win receives one invoice with one fee line calculated by shared `calculateInvoiceLine`. Existing reservations bind the original `BID_FEE_VERSION`; deployment of a different policy must not silently reprice old commitments. Invoice amounts use bigint kobo in storage and safe integer kobo in email DTOs.

Only the ledger module captures funds. Its group operation locks the wallet, fingerprints the sorted hold IDs and actual amount, captures across additive reservations and releases every unused kobo in the same transaction. Globally unique per-hold journal keys and a durable group receipt make exact retries safe and reject changed requests. The enclosing transaction also commits the invoice, pickup fulfilment, funding-intent terminal states and one encrypted notification record. A crash at any point rolls the entire charge transaction back, leaving the independently frozen winner recoverable. Already outbid or unused preparations are safely released through the original bid/ledger boundary.

Ordinary funded wins have the full estimated total reserved and should not need another top-up. A typed insufficient-funds result enters a 24-hour pending-invoice fallback. The next attempt checks available funds plus this win's active holds inside the wallet transaction before deciding it is unpaid. Funds that are sufficient when the worker resumes are settled rather than penalised for scheduler delay. Expired, genuinely insufficient results receive one uniquely referenced strike, have their remaining holds released, cancel the original invoice and create a new **draft** lot for staff to schedule. The original auction, bids and invoice history remain intact. The existing Redis eligibility fence runs before strike insertion. Three active strikes already block bid preparation.

Database, Redis, validation and unknown capture errors preserve the frozen result and funds. They set `last_error_at` where a settlement exists and produce a failed worker batch for operator review and retry; they do not start a buyer deadline or issue a strike. Shortage/default tests inject reported shortages at the service boundary because the normal full-hold path prevents them.

## Pickup and email

A paid invoice gets a cryptographically random pickup token. Its lookup hash and authenticated encrypted copy are stored separately. `POST /invoices/:id/pickup-pass` returns it only to the owning authenticated buyer while the paid pickup remains pending/booked/ready, with `Cache-Control: no-store` and the existing account rate limiter. The typed client is `readPickupPass`. Email never contains this bearer token or a bidder's private maximum. QR rendering and pickup scheduling screens remain later tasks.

The shared token-derived email template has an indigo wordmark, item and lot reference, exact hammer/premium/lot fee/VAT/total breakdown, payment status, warehouse details and pickup instructions. Pending notices use WAT deadlines; cancelled invoices use a separate explanation. All substituted HTML is escaped, the subject is server-generated, there are no remote assets, and a matching plain-text version is included. There are no links to unfinished product screens. See [reviewed layouts](../design/t12-email/README.md).

The encrypted outbox is unique by lot and outcome. A pending payment reminder is marked failed/superseded if payment or cancellation commits before it is sent. Local delivery uses the already approved Mailpit service only, in `AUTH_MODE=local`. Other modes retain pending messages until a real provider is explicitly configured. Delivery is at least once: an inbox acceptance followed by a lost database commit can repeat an email; it cannot repeat the charge. Provider-backed delivery and pickup-desk controls remain separate work.

## Database dictionary

The [generated dictionary](database-schema.md) includes all 31 tables, every column/type, relation, check, index and unique constraint. The new migration adds immutable lot settlements, contiguous closing cursors, unique nullable notification references and encrypted pickup tokens. Existing committed migrations are unchanged.
