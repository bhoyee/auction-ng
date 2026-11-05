# Staff live search review

The shared staff search control updates read-only list filters 250ms after typing pauses. It has a clear action, keyboard Enter support, a 120-character bound and composition-aware input handling. A new term resets pagination; clear restores the unfiltered first page. Existing request-scope guards ignore old responses. Search terms and intermediate keystrokes are not added to staff activity logs.

Ten targeted Playwright tests in `tests/e2e/staff-live-search.spec.ts` pass. They cover all 13 list views: Inventory, Buyers, Staff, Roles, Invoices, Withdrawals, Audit, the four Archived record types, Categories and Pickup centres. Additional cases cover debounce, composition, automatic empty results, clearing, page reset, late responses, navigation and input focus/touch sizing. No backend or money/bidding suites were rerun for this UI correction.

Screenshots at 360, 768 and 1280px show Inventory, Categories and Pickup centres filtering while the field retains focus. Browser fixtures are synthetic and do not replace existing API authorization/pagination tests. Existing tables retain their own horizontal scrolling on narrow screens; the page itself has no horizontal overflow. Evidence: `live-search-{inventory,categories,centres}-{360,768,1280}.png`.

Run the scoped test through the normal browser configuration with `pnpm exec playwright test tests/e2e/staff-live-search.spec.ts`. Its default staff URL is `http://localhost:3301`; `STAFF_BROWSER_URL` can point a development-only run at another preview port. The production API, validation, role checks, audit writes and mutation confirmation flows are unchanged.
