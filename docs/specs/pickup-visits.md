# Visit-based collection

Owner-approved redesign, 2026-11-01. Supersedes the per-order arrival flow in `pickup-check-in.md`.

## Buyer and staff flow

1. A signed-in buyer with paid, uncollected items opens Check-in and receives one private pass for the collection centre. Generating a pass does not register arrival.
2. Warehouse or admin staff scan the QR or enter its eight-character code. This creates or reopens one waiting visit for that buyer and centre, covering their eligible orders.
3. Staff verify the buyer and tick or scan the actual items being handed over. Scanning an item selects it; it does not mark it collected.
4. Confirm collection records an immutable receipt and completes the visit by default. Staff can keep the visit open for another batch. Unselected items remain awaiting pickup; an invoice becomes collected only when all its lines are collected.

A pass is valid for ten minutes. Expired, unconsumed passes cannot register arrival. Renewing invalidates the previous code. Replaying a consumed pass returns its existing visit, never a new arrival. Codes are not proof of entitlement to release stock without staff verification and confirmation.

## API

All routes are under `/pickup`, authenticated, rate limited and returned with `Cache-Control: no-store`. Bodies and queries use strict shared Zod schemas. Staff routes require `warehouse` or `admin`, with active staff status checked again inside mutations.

| Method | Path                  | Access | Purpose                                             |
| ------ | --------------------- | ------ | --------------------------------------------------- |
| GET    | `/centres`            | Buyer  | Paid pickup centres and eligible order counts       |
| POST   | `/visit-pass`         | Buyer  | Prepare/reuse pass; `{ locationId, renew? }`        |
| GET    | `/visit-pass/:id`     | Owner  | Pass and current visit status                       |
| POST   | `/visits/scan`        | Staff  | Register arrival from `{ code }`                    |
| GET    | `/visits`             | Staff  | Waiting visits, oldest first                        |
| GET    | `/visits/:id/items`   | Staff  | Current eligible items; optional exact `itemNumber` |
| POST   | `/visits/:id/collect` | Staff  | `{ idempotencyKey, lineIds, finishVisit? }`         |
| POST   | `/visits/:id/cancel`  | Staff  | Cancel an abandoned waiting visit with a reason     |

Lists use UUID cursors, default ten and maximum fifty items. A receipt contains one to fifty distinct line IDs. Cancellation requires a reason of five to three hundred characters. Typed clients are exported from `@auction-ng/api-client/pickup-visits`; Swagger documents the endpoints. Legacy per-order check-in and acknowledge/close mutations return HTTP 410. Historical reads remain available.

## Storage and correctness

`pickup_visits` records arrival and visit completion/cancellation. A partial unique index permits only one waiting visit per buyer and centre. `pickup_visit_passes` stores hashed lookup values and encrypted private token/code values, with one current pass per buyer and centre. Queue responses never contain pass secrets.

`pickup_collection_receipts` uses the client UUID as its primary idempotency key. Exact actor/visit/selection/finish retries return the original receipt; changed payloads conflict. `pickup_collection_items` has a unique invoice-line primary key, preventing duplicate handover. See `database-schema.md` for every column, type, foreign key, index and constraint.

Collection locks the visit, invoices, fulfilments and lines in a transaction, rechecks payment, ownership, centre and uncollected state, then records the receipt and fulfilment changes together. Concurrent confirmations cannot collect the same line twice. Audit records accompany staff mutations. No invoice amounts, wallet entries, bid holds or fees change here.

The migration preserves legacy arrivals and backfills waiting visits only for paid, uncollected eligible records. It never infers that an item was physically handed over.

## Network and device behaviour

Buyer status and staff queue/checklist refresh silently every fifteen seconds and on reconnection/focus. A failed read retains the last display and blocks unsafe confirmation. An uncertain confirmation retries the same frozen key and selection, including after a lost success response.

Keyboard QR scanners and manual codes are supported. Camera QR scanning is optional where the browser provides BarcodeDetector and camera access in a secure context. It uploads no video; closing the camera stops its tracks, including permission requests that resolve late. Unsupported devices retain scanner/code entry. Physical camera/scanner hardware still needs an on-site acceptance check.

## Verification

Twenty-two focused integration tests cover the new flow and retained legacy safeguards, including concurrency, replay, rollback, expiry, role boundaries, pagination and partial collection. Responsive browser checks use synthetic identities/pass data at 360, 768 and 1280 px; screenshots and scenarios are in `../design/pickup-visit/`. API, buyer and staff production builds and affected lint/type checks pass. Unrelated full-site suites were not rerun.
