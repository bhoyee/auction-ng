# Buyer-facing lot and invoice references

Lots and invoices have two separate identifiers:

| Purpose               | Lot example    | Invoice example    |
| --------------------- | -------------- | ------------------ |
| Buyer/staff reference | `LOT-000123`   | `INV-000456`       |
| Internal identity     | UUID `lots.id` | UUID `invoices.id` |

The owner requested readable alphanumeric references instead of UUIDs in buyer emails and invoices. Existing `lot_number` and invoice `number` columns already separate display references from internal identity; no replacement ID column is needed. PostgreSQL allocates the new references using independent, non-cycling bigint sequences. Codes have a minimum of six digits and grow instead of truncating when the counter exceeds six digits.

Staff can omit `lotNumber` when creating a draft to receive an automatic `LOT-` reference. Existing friendly custom codes such as `LAG-104` and `DEMO-0001` remain supported. New intake requests reject a UUID used as a display reference. Allocation skips an existing matching code and uses the existing intake advisory lock for races with manually assigned lot codes; database unique constraints remain the final guarantee. Relisted drafts receive their own automatic reference.

Invoices receive an `INV-` reference on creation. Retries return the same committed invoice and reference through the existing settlement record. Sequence values consumed by a rolled-back transaction are not reused, so gaps are expected. These references are not authentication credentials: ownership checks, API identifiers, foreign keys, ledger references and bid/payment idempotency keys continue to use UUIDs.

The migration changes only defaults and adds the sequences/function. Existing lot codes, issued invoices, journal entries and previously sent emails are preserved. New winner-email fixtures use actual allocated lot codes; the reviewed email preview shows `LOT-000123` and `INV-000456`. Already delivered UUID-based synthetic emails remain in Mailpit as historical messages; search for a newer “You won LOT-” receipt.

The [database dictionary](database-schema.md) still contains 31 tables and records both new defaults. No dependency or environment variable was added. Checks cover concurrent allocation, non-reuse after rollback, existing-code collisions, optional staff allocation, unchanged UUID identity and the existing settlement retry/concurrency suite.

Validation: `pnpm lint`, `pnpm typecheck`, `pnpm test` (268 tests), `pnpm build` (nine workspace builds) and `pnpm test:e2e` (12 browser checks) pass. The existing 1,000-lot closing check completed in 80.347 seconds; bid acceptance p95 was 15.23 ms, 1,000-viewer fanout p95 255.77 ms and catalogue p95 69.6 ms with four SQL queries. All existing performance limits remain unchanged. Email screenshots were refreshed and reviewed at 360, 768 and 1280 pixels.
