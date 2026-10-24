# T02 validation — 24 October 2026

**MONEY/BID CHANGE — needs human review.** Implementation is in [PR #2](https://github.com/bhoyee/auction-ng/pull/2), targeting `dev`. This PR is not automatically merged because it establishes money and ledger constraints.

## Schema coverage

The [generated database dictionary](specs/database-schema.md) covers all 20 tables: users, wallets, ledger_accounts, ledger_transactions, ledger_entries, virtual_accounts, payments, locations, categories, lots, lot_images, bids, watchlist, invoices, invoice_lines, fulfilments, notifications, strikes, audit_log and idempotency_keys. It includes column types, nullability, defaults, relations, primary and unique keys, CHECK constraints and every index. A test compares the dictionary to the migrated PostgreSQL catalog.

The schema follows the blueprint with the owner-approved two additional ledger tables. Cached wallet balances are intentionally absent: balances remain derived, and T05 will implement the ledger operations. Sensitive fields are ciphertext with keyed lookup hashes; raw webhook/audit/notification payloads have ciphertext storage. Referential actions restrict deletion and ID changes. Payment ownership and invoice/fulfilment ownership use composite foreign keys.

## Verified

- Windows: `pnpm lint`, `pnpm typecheck`, `pnpm test` (26 tests), `pnpm build` and `pnpm test:e2e` (6 checks) pass.
- Linux Docker: `pnpm db:migrate` has no pending changes on a repeat run, `pnpm db:seed` safely retries, and all 26 tests pass on a newly created isolated database.
- Both environments apply the initial migration to an empty test database. Tests cover documentation completeness, seed counts/concurrency/edit preservation, ciphertext and authenticated field separation, invalid statuses/dates/money/relations, duplicate image order and provider references, ownership checks, and required indexes.
- Ledger tests accept a balanced journal, reject empty/unbalanced journals and negative postings, preserve bigint values above JavaScript's safe-integer range, reject duplicate operation/posting keys and changes to committed rows, and allow only one successful journal among 10 concurrent duplicate submissions.
- Local application database contains 1 demo Lagos hub, 12 categories, 200 draft lots and placeholder images, 20 buyers and 3 staff. Wallets are empty and the seed never writes ledger rows.
- `pnpm db:keys` was run twice and preserved existing keys without printing values. `pnpm db:docs` generates formatted documentation from the live catalog.
- All eight local Docker services are healthy. Buyer/admin pages, API/realtime health and the photo-pending asset return HTTP 200.
- Complete Git history scan with Gitleaks 8.24.2 reports no secrets. `.env`, generated Prisma output and local tools remain ignored.

## Limits and review points

The seed uses synthetic unverified users, draft lots and an explicitly non-operational pickup address. It performs no provider calls, credits, holds, debits or invoice generation. Money operations and non-negative available-funds enforcement remain T05; fees/proxy calculations remain T03. No new HTTP endpoints or buyer screens were added. Test databases are isolated `auction_ng_test_*` databases and deliberately retained, never reset over application data. The test account needs CREATE DATABASE permission.

Human review should focus on the immutable double-entry journal model, deferred balance triggers, idempotency uniqueness, safe kobo bounds, encrypted-field representation and foreign-key ownership rules. Any later schema change must be a new migration; the committed initial migration must not be edited.
