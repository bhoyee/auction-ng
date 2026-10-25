# Accepted bid persistence (T10)

**MONEY/BID CHANGE — needs human review.** Persistence records already accepted outcomes; it does not accept new bids, move funds, close lots or issue invoices. [Funded acceptance](bidding.md) remains the authoritative admission path. No external dependencies or services are added.

## Delivery and acknowledgement

The existing worker starts a second BullMQ processor, `auction-ng-bid-persistence`, only when bidding is enabled and the private bid credential is configured. Every second it checks the API's ready namespace, then reads at most 50 accepted Redis Stream entries. The API must own its Redis runtime before the consumer creates keys, avoiding adoption of an unowned namespace during startup.

The `postgres-v1` Redis consumer group begins at `0`, including events accepted before the worker started. Each worker process has a distinct consumer UUID. `XAUTOCLAIM` reclaims pending entries after one second before `XREADGROUP` reads new ones. Both reads are bounded; neither blocks BullMQ's connection or heartbeats. Duplicate deliveries across workers are safe. Source events, proof keys, receipts and groups are not trimmed or deleted by this task.

The worker sends only source stream IDs to the API. PostgreSQL commits before a successful matching receipt is returned. Only then does the worker send `XACK`. A worker death, API failure or lost response leaves entries pending. On restart, another process reclaims and verifies the same immutable receipt instead of inserting duplicates. Missing or inconsistent source events fail the job and require investigation; they are not silently discarded.

## Private API

`POST /internal/bids/persist` reuses `BID_MAINTENANCE_TOKEN`, timing-safe bearer comparison and `Cache-Control: no-store`. It is excluded from buyer-facing Swagger, like the existing maintenance route. The internal typed client is exported separately from `@auction-ng/api-client/bid-persistence` so the Node worker does not load browser-only client types. Only localhost/127.0.0.1/the Compose `api` host, HTTP, root base paths and credentials of at least 32 characters are accepted by that client. Redirects are rejected.

| Body                                             | Response                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------- |
| `{ "streamIds": ["<milliseconds>-<sequence>"] }` | `{ "namespace": "auction:bids:v1:", "persisted": ["<same ID>"] }` |

Zod rejects unknown fields, duplicate IDs, invalid coordinates, query parameters and batches above 50. An empty batch is a readiness handshake and writes nothing. The client checks the exact returned ID list and the worker checks the namespace before acknowledging anything. No caller may submit bidder identities, maxima, amounts, ledger entries or a namespace override.

The API re-fetches every exact stream entry and its accepted funded proof. It validates the strict event/result shapes, original stream ID, immutable binding, ownership, lot, amount, selected mode, leader flag and resulting price/end-time invariants. Legacy events/proofs without a mode retain automatic semantics. A namespace-scoped PostgreSQL advisory transaction lock serializes duplicate writes. A batch commits all its receipt and bid rows together; any mismatch rolls it back. Replays compare the immutable receipt fingerprint and all expected row fields instead of overwriting rows or ignoring conflicts.

## Stored history

`bid_acceptances` has one receipt per funding intent (its UUID is both primary key and foreign key). It stores the namespace, original stream ID, canonical SHA-256 outcome fingerprint, private accepted-state JSON and server acceptance time. A unique namespace/stream constraint disambiguates coordinates from separate Redis namespaces.

Each receipt has one `request` row in `bids`, plus a `counter` row when the earlier leader automatically defends against a losing challenger. The request's applied amount is the lesser of its authorised maximum and the resulting displayed price; its private maximum remains in `max_kobo`. The counter row belongs to the defending leader at the resulting displayed price and is marked proxy. An automatic request is also marked proxy; the request/counter role distinguishes the records. For example, a ₦5,000 direct challenge against an existing ₦10,000 automatic limit records the challenger's ₦5,000 bid and the leader's ₦5,100 counter. It never attributes ₦5,100 to a buyer who authorised only ₦5,000.

Rows use intent-derived retry keys and namespace-hashed stream coordinates with a role suffix. These remain within existing column lengths and unique constraints. Unique acceptance/role keys prevent duplicate request/counter rows. The existing positive amount and `max_kobo >= amount_kobo` constraints remain enforced. New immutable-history triggers reject changes/deletion of bid rows and acceptance receipts. The additive migration changes no existing ledger or funding rows.

The complete accepted-state receipt identifies the actual leader and soft-close result. Future public history must not infer a leader by sorting private maxima, duplicate prices or tied timestamps. An own automatic limit raise retains the displayed price and is a private commitment update, not a new public price increase. Neither private maxima nor raw receipts may be exposed in buyer list responses.

All 29 tables, columns, types, relations, indexes and unique/check constraints are documented in [the generated dictionary](database-schema.md).

## Recovery boundary

Worker restart recovery is automatic against the same validated Redis process. Redis restart/restore recovery remains deliberately paused under T09's recorded runtime-identity rules; do not reset identities, delete groups or clear pending entries to force startup. Keep `BIDS_ENABLED=false` until review and later settlement work are ready.

T12 must freeze a result only after checking persistence has caught up with the closing barrier, including pending entries and undelivered backlog. Consumer-group last-delivered IDs alone do not prove that every earlier event committed. Compare stream coordinates numerically by milliseconds and sequence, not lexicographically. This task provides receipts and retry safety; it does not implement that closing barrier, invoicing or archival/retention policy.
