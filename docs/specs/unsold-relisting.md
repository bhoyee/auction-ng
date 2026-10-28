# Unsold stock and automatic relisting

**MONEY/BID CHANGE — needs human review.** Owner-approved 2026-10-28.

When the normal closer verifies a frozen result with no leader, no persisted bids and no accepted stream event, it can create a replacement auction. Automatic relisting defaults to enabled. Shared `unsoldRelistRules` sets the duration to 24 hours and the maximum automatic retries to two: original → retry 1 → retry 2 → staff review. The timer starts when the replacement is created, including after worker downtime.

The original auction stays closed and its terminal settlement stays unsold. The replacement has a new UUID and secure random eight-character public reference. `lot_settlements.relist_lot_id` provides the unique history link; the chain is never reset. The closing transaction locks the original lot, checks for an existing settlement, copies the item, inserts the audit and records the immutable settlement/link together. A failure rolls back all of them; concurrent workers and retries cannot duplicate stock. Existing terminal settlement protections are unchanged.

Copy title, description/condition notes, condition grade, retail/start prices, category, pickup location, image URLs/order/dimensions/thumbnail metadata, Top Deals selection/order and relisting preference. Do not copy accepted bids, private limits, reservations, invoices or watchlists. Normal Redis loading initializes the new ID; the existing database search trigger queues the new auction and old closed status. No payment or ledger operation is introduced.

After the second retry, or when the preference is disabled, keep the unsold stock for staff review. Historical closed auctions are never restarted by migration or periodic scanning. Unpaid wins continue through the existing 24-hour payment deadline, strike and draft-only relist; the draft inherits the existing retry count and preference. A staff member must schedule that draft separately.

## Administrator controls

Staff email/password plus authenticator sign-in is required. The lot editor provides **Auto-relist if no bids**, a retry count and **Save relisting**. Closed/cancelled lots cannot be switched back on. The **Unsold awaiting review** filter shows closed no-bid settlements with no replacement; it excludes paid purchases, unpaid wins and old auctions already replaced. This is a focused addition to the existing editor; the wider staff portal remains pending.

- `PATCH /admin/lots/:id/auto-relist`: strict `{ autoRelistEnabled: boolean, expectedUpdatedAt: ISO timestamp }`; active administrator only, rate-limited, row-locked, optimistic version checked, encrypted before/after audit. Returns the typed admin lot DTO. Cannot edit prices, fees, condition, timers or retry count.
- `GET /admin/lots?unsoldOnly=true`: bounded cursor pagination, maximum 50 rows; existing reference filter still applies. Reads remain audited.
- Admin DTO adds `autoRelistEnabled` and `autoRelistCount`; public catalogue DTOs are unchanged.

Migration `20261028000300_unsold_auto_relist` adds the boolean default and bounded integer count (0–2), plus a partial index for unsold/no-replacement review. Existing unique settlement/relist constraints retain the one-original/one-replacement relationship. The generated database dictionary documents columns, types, relations, checks, indexes and unique constraints.

## Focused verification

From PowerShell at the repository root, with Node 22, pnpm and local PostgreSQL/Redis running:

```powershell
pnpm db:generate
node scripts/check-unsold-relisting.mjs
```

The helper creates and retains a fresh isolated test database, migrates it, runs the relevant closing and admin suites, and regenerates the schema dictionary. It does not reset application data. Coverage includes concurrent closing, two-retry limit, opt-out, all five condition grades, copied photos, existing sold/payment/default paths and the 1,000-lot closing workload. No full application suite is required for this focused change; CI retains its full checks.

Validated locally: 18 closing tests and seven admin/authentication/review tests pass. The 1,000-lot workload completes in approximately 70 seconds. Targeted ESLint/format checks, affected package/API/admin types, root test-source types and API/web/admin production builds pass. Responsive browser checks pass at 360/768/1280 px, including real protected preference saves, filtered empty state, offline feedback and zero overflow/browser errors. [Screenshots and browser record](../design/unsold-relisting/README.md). The additive migration and API/admin build are applied to local Docker; all nine services report healthy. No GitHub push or main-branch merge is included.
