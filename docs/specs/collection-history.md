# Collected item history

`GET /pickup/collections` is a read-only staff endpoint requiring `pickup.manage`, authenticated staff/device credentials and current database-side permission verification. Query: `limit` (1–50, default 10), `q` (trimmed, max 120 characters) and optional `cursor` (`ISO timestamp|invoice-line UUID`). Unknown or malformed fields are rejected. The endpoint is documented in OpenAPI and exposed by `createPickupVisitClient().history()`.

The shared strict response has `items` and `nextCursor`. Each row contains invoice-line `id`, `itemNumber`, `title`, `invoiceNumber`, `buyerName`, `location`, nullable `collectedAt` and nullable `staffName`. No pass token, email, address, payment details or wallet data are exposed.

Individual pickup-collection items/receipts establish confirmed handovers, including partial visits. Legacy pickup fulfilments with a collection timestamp or collected status supply rows only when an individual receipt does not already exist. Preserve history even if an order's later status changes. Unknown legacy staff/time remains null. Sort newest timestamp first with invoice-line UUID as the stable tie-breaker; unknown times sort last. Search matches literal text across displayed item/invoice references, title, buyer, centre and staff names. All SQL values are bound parameters.

Queries have fixed count independent of row count; existing relation indexes and new receipt-time/legacy-fulfilment indexes support the read model. Migration `20261105000700_collection_history` adds indexes only. Existing pickup mutations, receipts, audit events and money rules are unchanged.
