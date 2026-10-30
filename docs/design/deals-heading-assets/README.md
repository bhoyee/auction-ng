# Deals heading artwork and filter choices

The three owner-uploaded PNG illustrations replace heading icons on All Deals, Top Deals and Ending Soon. Titles use matching uppercase responsive 40–64 px/800 type. The web build runs `scripts/prepare-deals-images.mjs` using existing Sharp; WebP sizes are 9,726 / 7,806 / 10,226 bytes, preserving transparency.

- All Deals: [phone](deals-360.png), [tablet](deals-768.png), [desktop](deals-1280.png).
- Top Deals: [phone](top-deals-360.png), [tablet](top-deals-768.png), [desktop](top-deals-1280.png).
- Ending Soon: [phone](ending-soon-360.png), [tablet](ending-soon-768.png), [desktop](ending-soon-1280.png).
- Green checkbox states and red Clear: [phone](condition-menu-360.png), [tablet](condition-menu-768.png), [desktop](condition-menu-1280.png).

Current bid: Under 30,000 Naira; Under 100,000 Naira; 100,000 Naira and above. The first two intentionally overlap, as requested; matching stays OR within a group and AND between groups.

Auction ends: Within 1 hour (including exactly one hour), Ends today, Ends tomorrow. Calendar days use WAT (UTC+1), including the exact midnight boundary. The Ending Soon page still limits its own contents to the next hour; choosing tomorrow narrows that scope rather than expanding it.

Conditions: all five are checked initially. Clear restores all. Deliberately unchecking all produces no matches; `conditions=` persists that choice across reloads. An omitted conditions parameter means all conditions.

Targeted verification passed: twelve shared filter tests, eleven affected catalogue integration tests, web/API/UI types, changed-file lint/format and web/API production builds. Browser checks at 360/768/1280 verify artwork decoding, equal heading sizes, multi-selection, green checked text, condition defaults/empty reload, new options, URL restoration, pagination, no overflow and no browser errors. No unrelated financial or full-site suites were run.

Reproduce: `pnpm exec vitest run tests/deal-filters.test.ts --coverage.enabled=false`; `node scripts/check-admin-top-deals.mjs --catalogue-only`; `node scripts/check-deals-ui.mjs` against the running local Docker demo. No money, accepted bids or application data were modified. Broader T13 loading-budget and owner review remain open.
