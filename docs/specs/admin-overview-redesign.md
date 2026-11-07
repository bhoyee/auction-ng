# LotVanta Overview redesign

Approved reference: `docs/design/admin-overview.png`. Branch: `task/admin-overview-redesign`.

## Scope

Replace the previous four-panel substitute with the complete five-row Overview: six KPI cards, revenue/comparison trend and live summary, category GMV and collection funnel, attention/top-lots/activity panels, then stock ageing and monthly revenue/expenses. Preserve existing authentication, permissions, check-in execution and working destinations. The new shell treatment is scoped to Overview; other pages retain their existing layout.

The wordmark is LotVanta. Full monetary values on KPI cards follow ADMIN_DESIGN.md even though the reference abbreviates them. Dates use Africa/Lagos; selected dates, comparison and chart grain live in the URL. Weekly chart buckets start Monday. Demo totals remain identical when changing chart grain and match their exports.

## Sources and demo isolation

`GET /staff/analytics/overview/:widget` accepts strict `from`, `to`, `compare` and `grain` parameters. Widget names and responses are shared Zod schemas, the client is typed, and the endpoint is documented in OpenAPI. Every request checks an active authenticated staff session, dashboard access and the widget-specific capability. Queues are additionally filtered by destination capability.

There are currently **no production aggregates** for this new dashboard. Real mode returns an explicit unavailable state; it never queries hot ledger/bid tables, relabels invoice totals as revenue, or silently substitutes sample figures.

For local visual review only, set both private API environment settings:

```dotenv
DEPLOYMENT_ENV=local
ADMIN_OVERVIEW_DEMO_ENABLED=true
```

Other deployment values, a missing classification, or a disabled flag block fixtures. `NODE_ENV=production` is also used by the local optimised Docker build; it is not the deployment classification. On hosting use `DEPLOYMENT_ENV=production` and leave the demo flag false. The flags are documented in `.env.example` and wired into Compose with production-safe defaults.

Fixtures live exclusively in the API's `overview-demo.ts`. The page and each populated widget are marked Demo, including the top live summary and sample alerts; downloadable chart files use a demo prefix. No auctions, bids, wallet balances, requests, invoices or audit events are seeded or changed by these fixtures. They are synthetic visual-review data, not fabricated marketplace operations.

## Current widget readiness

| Widget                                                         | Source status                                                                    | Capability                             |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------- |
| KPIs, revenue, category GMV, funnel, top lots, monthly finance | Demo fixtures or explicit unavailable state; production aggregation remains T15c | finance.read                           |
| Live summary                                                   | Demo fixture; Redis live-stat producer/read adapter still needed                 | auctions.manage                        |
| Attention/alerts                                               | Permission-filtered demo queues; operational aggregate reader still needed       | dashboard.view plus destination access |
| Activity                                                       | Demo feed; redacted aggregate/feed integration remains open                      | audit.read                             |
| Stock ageing                                                   | Demo fixture; stock cost/batch records and aggregates remain open                | inventory.read                         |

This task completes the visual preview and source boundary, **not T15c or the full T15d production analytics acceptance criteria**. The one-year real-aggregate performance benchmark cannot be claimed from synthetic UI tests. No money, fee, bid, cancellation, storage or 2FA rules change.

## Navigation

Existing Lots, Intake, Publish queue, Bid review, Invoices, Pickup desk, Buyers, Tickets, Finance, Staff/roles, Audit and Fees destinations remain connected to existing workflows. Inventory's category/centre management remains on its existing secondary navigation. Unbuilt Live monitor, batches, delivery, fraud, ledger, expense, reconciliation and report pages are disabled and labelled Later; the redesign does not create fake functional pages or grant new permissions. Dedicated filtered report/destination integration remains open. KPI cards open an in-page metric report with the same selected range.

The Overview command palette additionally searches permitted lot titles/references, buyer names and invoice numbers through the existing protected records endpoint, with a 250ms debounce, at most five results per kind, stale-response fencing and filtered-list navigation. It never searches forbidden kinds or sends records to an external service. Phone-number lookup is not advertised because the current records endpoint does not support it. Other sections retain their existing section picker.

## States and verification

Widgets request and refresh independently every thirty seconds while visible/online. Scope fencing prevents a response for another range/session/permission set from appearing. Refresh preserves the selected chart/table view, and a failed widget retains its last confirmed snapshot with Retry. Missing, empty, loading, offline and error states are distinct. Financial access is never inferred just from a role's display name.

Charts include accessible labels and table alternatives, no load animation, exact-money tooltips and CSV exports. KPI definitions come from `packages/shared/src/metrics.ts`; deltas include arrows/text and use the metric's good direction. Check-in keeps its previously approved prominent yellow action.

Responsive captures: 360, 768, 1280, 1440 and 1920px in `docs/design/admin-overview-redesign/`. Review against the reference, noting deliberate LotVanta, demo-labelling, full-price and working-destination differences. Relevant navigation/session/check-in tests retain their assertions with the new greeting and the 768px tablet icon-rail breakpoint.

Validation: thirteen focused source/date/metric unit tests and twenty-nine directly affected browser checks pass, plus three bid-review/check-in emphasis regression cases. Admin/API builds, affected package type checks and changed-file lint/format checks pass. These are targeted checks; no full-site money/bidding suites were rerun. No actual one-year production aggregate benchmark is claimed.
