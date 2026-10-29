# Watchlist tabs review — 2026-10-29

Polish follow-up: scoped tab hover/focus and solid selected tab, danger-red Unwatch, prominent white-on-indigo countdown (white-on-red within twenty minutes), and Previous/Next with current page and ten items per page in all three tabs. The updated targeted browser check passed forward/back navigation and disabled boundaries in Watching, Won and Lost, both timer colours, button styling and responsive captures at 360/768/1280 px. Affected web/UI types, targeted lint/format and the buyer-web production build passed; no backend, money or full-site suites were rerun for this styling/navigation correction.

Signed-in browser fixtures exercise only this watchlist correction, using a vendored representative demo lot photo. Names, wallet values and outcomes in these captures are isolated browser fixtures, not inserted transactions or real bids.

| Width | Watching | Won | Lost / unsold |
| --- | --- | --- | --- |
| 360 px | [Watching](watching-360.png) | [Won](won-360.png) | [Lost](lost-360.png) |
| 768 px | [Watching](watching-768.png) | [Won](won-768.png) | [Lost](lost-768.png) |
| 1280 px | [Watching](watching-1280.png) | [Won](won-1280.png) | [Lost](lost-1280.png) |

`node scripts/check-watchlist-ui.mjs` checks three tabs, actual image loading, no horizontal overflow, server-clock expiry reconciliation, typed amount handoff to fee review, no automatic bid writes, Unwatch/count invalidation and error/retry. Results: [review.json](review.json).

The existing `check-watchlist-counts-ui.mjs` additionally passed confirmed add/remove, authoritative header/sidebar/dropdown counts, delayed-response fencing, cross-tab invalidation, owner switching and unavailable counts at all three widths.

Targeted buyer/history integration checks: 13 pass, including saved-only filtering, owned auction and Buy Now wins, distinct unsold outcomes, cursor pagination/isolation, authentication, unknown-field rejection, no-store and unchanged ledger entries. Affected API/web/shared/client/UI types, targeted ESLint/Prettier and API/web production builds pass. No unrelated full-site, payment or bid suites were run. The bid acceptance/hold/settlement algorithms are unchanged; the UI still requires explicit fee confirmation.

Visual review: Auction NG tokens/type, clear hierarchy, one responsive card column, unambiguous outcomes, actual pickup address and 44 px controls. Photos use the existing optimized demo resolver and fallback/retry component. No fake statistics, additional dependencies, framework changes or secrets. Broader T13 acceptance remains open.
