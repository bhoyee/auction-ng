# Buyer-facing lot and invoice references

| Purpose               | Lot example  | Invoice example  |
| --------------------- | ------------ | ---------------- |
| Buyer/staff reference | LOT-K7M4X9Q2 | INV-R8V3N6TZ     |
| Internal identity     | UUID lots.id | UUID invoices.id |

The owner replaced sequential references with random codes. Each newly generated body is exactly eight characters, contains letters and digits, and uses the alphabet 23456789ABCDEFGHJKLMNPQRSTUVWXYZ to avoid confusing 0, 1, I and O.

PostgreSQL takes 40 secure random bits from a fresh gen_random_uuid() draw, outside its fixed version/variant bits, and encodes them as eight base-32 symbols. All-letter/all-digit draws are rejected. It does not truncate the record's UUID, use a counter, or require an extension or dependency.

Allocation locks each candidate in the existing lot-code advisory-lock namespace (707) or invoice namespace (708), checks its indexed display field, and retries existing-code collisions. Database unique constraints remain the final guarantee. After 100 occupied candidates, allocation fails with retryable SQLSTATE 40001 instead of looping indefinitely. Random references are not authentication credentials; ownership checks remain mandatory.

Staff can omit lotNumber when creating a draft to allocate a code. Existing custom codes such as LAG-104 and seeded DEMO-0001 remain supported. UUID display inputs are rejected. Relisted drafts receive fresh references. Committed settlement retries return the same invoice and reference. An uncommitted random draw is not permanently reserved.

Migration 20261025001200_random_references replaces the allocator without editing previous migrations, existing records or issued emails. Legacy sequences are retained but unused. UUID identities, foreign keys, ledger references, payment/bid idempotency keys and all money calculations remain unchanged. The database dictionary still describes 31 tables with the same defaults and constraints.

Tests cover exact format and mixed character classes, concurrent allocation, rollback, deterministic collision retries, safe retry exhaustion, optional staff allocation, unchanged UUID identity and settlement concurrency/idempotency. Winner-email previews use the examples above at 360, 768 and 1280 pixels. No environment variables or dependencies were added.
