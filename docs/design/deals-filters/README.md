# Deals filters

Preview [All Deals](http://localhost:3300/deals), [Top Deals](http://localhost:3300/top-deals), [Ending Soon](http://localhost:3300/ending-soon). Category result pages share the same layout.

Large section-specific title/icon, no auction count/description, no pickup selector or Apply button. Current bid, Auction ends and Condition are multi-checkbox dropdowns; selections auto-filter, stay in the URL and combine OR within a dropdown / AND across dropdowns. Next/Previous keeps 24-item pages and edits reset the cursor. Existing text search is separate.

- All Deals: [phone](deals-360.png), [tablet](deals-768.png), [desktop](deals-1280.png).
- Top Deals: [phone](top-deals-360.png), [tablet](top-deals-768.png), [desktop](top-deals-1280.png).
- Ending Soon: [phone](ending-soon-360.png), [tablet](ending-soon-768.png), [desktop](ending-soon-1280.png).
- Checkbox menu: [phone](condition-menu-360.png), [tablet](condition-menu-768.png), [desktop](condition-menu-1280.png).

Focused checks passed: nine shared filtering/privacy/validation tests, eleven catalogue API integration tests, web/API/UI types, changed-file lint/format and web/API production builds. Browser checks at 360/768/1280 cover several conditions/prices, cross-group filtering, URL reload restoration, menu bounds, Escape, clear, cursor Next/Previous, no overflow and no browser errors. No unrelated full-site or financial suites were run.

`node scripts/check-deals-ui.mjs` checks the running Docker demo. `pnpm exec vitest run tests/deal-filters.test.ts --coverage.enabled=false` and `node scripts/check-admin-top-deals.mjs --catalogue-only` reproduce focused logic checks.

Current bids come from a batched Redis read; starting bids are used only when Redis explicitly records no accepted bid. Missing states are not guessed. Candidate scans are bounded and paginated; sparse pages are followed until a matching page or the end. Card subscriptions recheck live price/time bands; metadata refreshes silently every fifteen seconds. Existing auction/money rules stay unchanged. T13 loading-budget and owner-review gates remain open.
