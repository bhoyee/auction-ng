# LotVanta Overview redesign

2026-11-07 correction: replace the menu-style Overview palette with an inline staff-header search and anchored results. After two characters and a 250ms pause, search all currently supported protected record readers (items, buyers, invoices, withdrawals, staff, roles, audit, categories and centres), up to five matches per type. Only query capabilities held by the current staff member; the server independently authorises every reader. Matching page/tool shortcuts appear only after typing, never as an initial copy of the sidebar. Selecting a record opens its filtered list and correct tab. Search remains available on other staff pages. Support conversation text is encrypted and is not part of these record readers; search can locate the Support tickets page, not conversation bodies. This is not a full-text index of every portal field.

Hide Compare and request no comparison for Overview; retain underlying comparison contracts for possible later use. Omit empty comparison deltas and legends. Put Export and the yellow Check in a buyer action at the top right of the greeting, with date filters beneath. Keep only the selected WAT range and compact update age below the greeting; remove the duplicate name/role beside the initials avatar. Existing demo labels and data-source limitations remain unchanged.

Approved reference: `docs/design/admin-overview.png`. Branch: `task/admin-overview-redesign`.

## Scope

Replace the previous four-panel substitute with the complete five-row Overview: six KPI cards, revenue/comparison trend and live summary, category GMV and collection funnel, attention/top-lots/activity panels, then stock ageing and monthly revenue/expenses. Preserve existing authentication, permissions, check-in execution and working destinations. The new shell treatment is scoped to Overview; other pages retain their existing layout.

The wordmark is LotVanta. Full monetary values on KPI cards follow ADMIN_DESIGN.md even though the reference abbreviates them. Dates use Africa/Lagos; selected dates, comparison and chart grain live in the URL. Weekly chart buckets start Monday. Demo totals remain identical when changing chart grain and match their exports.

## Sources and demo isolation

`GET /staff/analytics/overview/:widget` accepts strict `from`, `to`, `compare` and `grain` parameters. Widget names and responses are shared Zod schemas, the client is typed, and the endpoint is documented in OpenAPI. Every request checks an active authenticated staff session, dashboard access and the widget-specific capability. Queues are additionally filtered by destination capability.

Actual application-record read models are now implemented for eight Overview widgets; see [real analytics](overview-real-analytics.md). Staff requests read those models rather than hot ledger/bid tables. Missing expense and stock-cost sources remain explicitly unavailable. The local installation has static preview disabled and calculates from its seeded records.

The earlier static visual-preview factory can still be used for isolated design review only with both private API environment settings below. Keep the demo flag **false** for actual application-record analytics, including seeded development databases:

```dotenv
DEPLOYMENT_ENV=local
ADMIN_OVERVIEW_DEMO_ENABLED=true
```

Other deployment values, a missing classification, or a disabled flag block fixtures. `NODE_ENV=production` is also used by the local optimised Docker build; it is not the deployment classification. On hosting use `DEPLOYMENT_ENV=production` and leave the demo flag false. The flags are documented in `.env.example` and wired into Compose with production-safe defaults.

When explicitly enabled, static fixtures live exclusively in the API's `overview-demo.ts`. That preview marks the page and populated widgets Demo, including its top live summary and sample alerts; preview downloads use a demo prefix. These fixtures never create or change auctions, bids, wallets, requests, invoices or audit events. They are synthetic visual-review data and are disabled on the running local Overview.

## Current widget readiness

| Widget                                        | Source status                                                              | Capability                             |
| --------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------- |
| KPIs, revenue, category GMV, funnel, top lots | Actual materialised read models refreshed every five minutes               | finance.read                           |
| Monthly finance                               | Unavailable until expense records exist                                    | finance.read                           |
| Live summary                                  | Actual ten-second operational snapshot; Redis producer remains future work | auctions.manage                        |
| Attention/alerts                              | Actual permission-filtered operational snapshot                            | dashboard.view plus destination access |
| Activity                                      | Actual redacted audit snapshot                                             | audit.read                             |
| Stock ageing                                  | Unavailable until stock cost/batch records exist                           | inventory.read                         |

The visual preview and actual-source integration still do **not** complete all T15c/T15d requirements. A one-year isolated read-model check passes locally; full production-volume and end-to-end HTTP benchmarks remain open. No money, fee, bid, cancellation, storage or 2FA execution rules change.

## Navigation

Existing Lots, Intake, Publish queue, Bid review, Invoices, Pickup desk, Buyers, Tickets, Finance, Staff/roles, Audit and Fees destinations remain connected to existing workflows. Inventory's category/centre management remains on its existing secondary navigation. Unbuilt Live monitor, batches, delivery, fraud, ledger, expense, reconciliation and report pages are disabled and labelled Later; the redesign does not create fake functional pages or grant new permissions. Dedicated filtered report/destination integration remains open. KPI cards open an in-page metric report with the same selected range.

The Overview command palette additionally searches permitted lot titles/references, buyer names and invoice numbers through the existing protected records endpoint, with a 250ms debounce, at most five results per kind, stale-response fencing and filtered-list navigation. It never searches forbidden kinds or sends records to an external service. Phone-number lookup is not advertised because the current records endpoint does not support it. Other sections retain their existing section picker.

## States and verification

Widgets request and refresh independently every five seconds while visible/online. Staff activity/socket reconnection invalidates them through the existing staff-refresh signal; a 250ms burst window coalesces notifications, with one queued follow-up if a request was in flight. Focus, visibility return and reconnection refresh immediately. Scope fencing prevents a response for another range/session/permission set from appearing. Refresh preserves the selected chart/table view, and a temporary failure retains its last confirmed snapshot with Retry. A 401/403 removes protected widget data; session expiry retains the existing sign-in handling. Missing, empty, loading, offline and error states are distinct. Financial access is never inferred just from a role's display name.

2026-11-07 refresh verification: five focused browser cases cover all-widget five-second reconciliation, retained chart/table selection, socket burst coalescing, failure/recovery, authorization denial and hidden/offline return. Changed-file lint, admin/UI type checks and the admin production build pass. This completes refresh transport only: existing demo responses remain labelled samples and production aggregate sources remain open. No automatic fixture-to-production conversion is implied.

Charts include accessible labels and table alternatives, no load animation, exact-money tooltips and CSV exports. KPI definitions come from `packages/shared/src/metrics.ts`; deltas include arrows/text and use the metric's good direction. Check-in keeps its previously approved prominent yellow action.

Responsive captures: 360, 768, 1280, 1440 and 1920px in `docs/design/admin-overview-redesign/`. Review against the reference, noting deliberate LotVanta, demo-labelling, full-price and working-destination differences. Relevant navigation/session/check-in tests retain their assertions with the new greeting and the 768px tablet icon-rail breakpoint.

Validation: thirteen focused source/date/metric unit tests and twenty-nine directly affected browser checks pass, plus three bid-review/check-in emphasis regression cases. Admin/API builds, affected package type checks and changed-file lint/format checks pass. These are targeted checks; no full-site money/bidding suites were rerun. No actual one-year production aggregate benchmark is claimed.
