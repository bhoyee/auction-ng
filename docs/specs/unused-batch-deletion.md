# Unused batch deletion

Owner-approved 2026-11-26. This narrowly amends the earlier “a batch is never removed” rule for batches created by mistake.

Only a batch still Arriving, with no received date/count and no stock ever linked to it, can be deleted. Any linked lot (including archived/deleted lots), unit-cost record or permanent stock-history marker blocks deletion. Moving an item to another batch never makes its original batch eligible. Used batches stay in history and use Close instead.

Staff need both `batches.manage` and `batches.costs`, as well as access to Batches. Deletion asks for a reason and the exact batch code. The API checks permissions, current revision, eligibility and confirmation again. Exact retries replay the original result. Deleted batches leave active lists, intake pickers, supplier totals and CSV exports. Authorised managers can find them in Deleted; other staff cannot access their details or attachments.

The restore period is exactly 30 calendar days from the server-recorded deletion timestamp. Restore requires a reason and current revision. During this window the original details and encrypted attachments remain available read-only. Expired records cannot be restored even if cleanup has not run yet.

The existing batch worker runs authenticated cleanup hourly, at most 25 records per invocation. It rechecks eligibility under the same batch row lock and recalculation lock, and removes only expired unused records. Attachments and derived batch/category records are removed in the same transaction. Audit history and idempotency receipts remain; cleanup writes an encrypted metadata snapshot and a `batches.purged` audit event. No ledger, bid, invoice, pickup or sale record is deleted or changed.

PostgreSQL guards enforce the stock-history marker, forbid linking stock to a deleted batch, reject late restoration and block direct permanent deletion outside the maintenance transaction. Deletion, receiving stock and linking stock contend on the batch row, so a concurrent request cannot create a deleted used batch. Cleanup safely retries and serializes with restore; concurrent cleanup runs remove and audit each record once. The maintenance endpoint uses the existing private `BID_MAINTENANCE_TOKEN`; no new public endpoint or secret is required.

Endpoints:

- `POST /admin/batches/delete`: revision, retry key, reason and batch-code confirmation.
- `POST /admin/batches/restore`: revision, retry key and reason.
- `GET /admin/batches?tab=deleted`: permission-scoped, cursor-paginated deleted list.
- `POST /internal/batches/cleanup-deleted`: private worker token and strict empty body.

Verification: batch API integration/concurrency tests; shared restore-window/validation and private client tests; Delete/Restore browser flows at 360, 768 and 1280 pixels. Visual evidence is in `docs/design/batch-deletion`.
