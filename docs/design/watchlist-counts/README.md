# Header and watchlist count review

Owner-requested cleanup, 2026-10-29. Preview http://localhost:3300/account after signing in, then save/remove an item from a lot or your Watchlist.

| View | Phone | Tablet | Desktop |
| --- | --- | --- | --- |
| Profile/sidebar | [360](profile-360.png) | [768](profile-768.png) | [1280](profile-1280.png) |
| Account dropdown | [360](account-menu-360.png) | [768](account-menu-768.png) | [1280](account-menu-1280.png) |

[Collapsed sidebar](collapsed-1280.png). Synthetic UI fixtures only; the wallet shown in the sidebar is not a real customer balance.

The header wallet chip and extra Profile Forgot your password link are removed. Balance remains in the account dropdown/sidebar. The header heart, account dropdown Watchlist and portal Watchlist show the same authoritative count; large totals display 99+ while retaining exact accessible labels.

Eleven focused buyer/history checks pass, including the new count endpoint: totals beyond a fifty-item page, owner isolation, no-store, strict inputs, authentication, duplicate-save/remove retries and no ledger changes. API/web/root type checks, changed-file lint/formatting and API/web production builds pass. No full-site, wallet or bid suites were run; CI is unchanged.

Browser checks pass at 360/768/1280: actual save/remove controls, header/dropdown/sidebar updates, delayed count response followed by a newer change, duplicate invalidation, another open tab, zero and 99+ counts, hiding failed reads, owner changes, removal of the two requested elements, no overflow or browser errors. Watch data and authentication are local browser fixtures; real demo lots provide read-only page imagery. No actual watch, payment or customer record is changed by this browser check. Backend counts are independently tested against isolated PostgreSQL records.

Counts refresh after confirmed local changes and same-user tab invalidations, with a fifteen-second visible-page fallback plus focus/online reconciliation. Other-device changes use that fallback; no new socket protocol is claimed.

Reproduce API checks: node scripts/check-admin-top-deals.mjs --history-only

Browser: node scripts/check-watchlist-counts-ui.mjs (buyer web and API running locally, with at least one visible demo lot).

Full T13 acceptance remains open. Local commits only; no push performed for this task.
