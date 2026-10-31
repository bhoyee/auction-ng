# Pickup arrival check-in

Owner-authorised 2026-10-31. Arrival registration is separate from invoice viewing and physical goods collection. No money, fees, bid or collection mutation is introduced.

## Buyer flow

GET /buyers/collections remains the paid/uncollected pickup-order source. Check-in shows ten orders per page and active arrivals separately. Buyer chooses an order and confirms they are at the centre. POST /pickup/check-in takes strict invoiceId and idempotencyKey UUIDs; both authenticated buyer and device are required. Dedicated arrival limits bound mutations (20 per buyer, 300 per staff member and 1,000 per IP per existing 15-minute window), independently of wallet/payment limits. No GPS or physical-presence verification is claimed. A buyer with multiple orders checks each in separately.

The service locks the owner/request key, then the order key, then the invoice/fulfilment rows. Recheck current ownership, paid status, pickup type, allowed pending/booked/ready status and uncollected state inside the transaction. An exact retry returns its original arrival; reusing a key for a different invoice conflicts. Different keys cannot create a second active arrival. An active-order conflict asks the buyer to refresh. No notification email is sent.

## Staff flow

GET /pickup/arrivals lists only the buyer's active visits. GET /pickup/staff/arrivals requires warehouse/admin. Both are oldest-first cursor lists, default ten and maximum fifty; owner cursor replay is rejected. The staff view omits payment details, contact data and private QR tokens. Only arrivals whose orders are still paid/uncollected are visible. Normal changes appear on silent 15-second refresh and on focus/reconnection.

POST /pickup/staff/arrivals/:id accepts strict status (acknowledged or closed) and expectedStatus. Require current active warehouse/admin role, lock the visit and compare the expected state. Only waiting -> acknowledged -> closed transitions are exposed. Repeating the current target state is harmless and creates no duplicate audit. A competing/stale transition conflicts. Every successful transition records actor, before and after status in encrypted audit_log. Closing is explicitly confirmed in the UI and only closes the arrival visit: goods remain uncollected, no QR is consumed and no invoice or ledger is changed. A fresh check-in is possible after a closed visit.

## Database

Additive migration 20261031000400_pickup_arrivals adds pickup_arrivals. Columns: id UUID primary/generated; fulfilment_id UUID required; user_id UUID required; request_key UUID required; status VARCHAR(24) required/default waiting with CHECK waiting/acknowledged/closed/cancelled (cancelled reserved, no cancel endpoint); handled_by_id UUID nullable; created_at and updated_at TIMESTAMPTZ(3) required/default now, updated_at maintained by Prisma on update. Foreign keys to fulfilments(id), users(id) as buyer and users(id) as last handling staff use RESTRICT on update/delete.

Unique owner/request key binds retries. Partial unique fulfilment_id where status waiting/acknowledged prevents concurrent active visits. Indexes: (user_id, created_at, id), (status, created_at, id), fulfilment_id and handled_by_id, plus primary/unique backing indexes. Relation reads use a fixed number of queries, no per-row lookups. Full catalog, columns/types, relations, indexes and constraints: [database dictionary](database-schema.md#pickup_arrivals). No existing data is deleted.

## Verification

Nine targeted integration cases cover strict validation, concurrent retries/different keys, eligibility/ownership, cursor fencing, staff transitions/audit idempotence, external collection removal and HTTP roles/typed client. Route-security checks use synthetic authenticated identities while actual Nest guards enforce roles; existing password/TOTP authentication is unchanged. New isolated databases are retained rather than resetting user data. Buyer/staff browser checks at 360/768/1280px cover confirmation, same-key error retry, status updates, staff acknowledge/close, explicit no-collection copy and pagination. Relevant lint/types and API/web/admin builds pass. See [screenshots](../design/pickup-check-in/README.md).

## Limits

Check-in is an arrival queue, not the QR scan-and-confirm physical handover workflow. It does not certify a buyer is physically present, reserve a pickup slot, estimate waiting time or send a pickup SMS/email. Staff queue is currently marketplace-wide for authorised warehouse/admin accounts; location-specific staff assignment is future work.
