# Purchased auction archive

Preview: http://localhost:3300/past-auctions. Footer Explore contains Past Auctions; the bold public email now appears under Help.

## Eligibility and API

`GET /past-auctions?limit=24&cursor=...` is a public read-only catalogue endpoint, documented in Swagger and typed by `createCatalogueClient().pastAuctions()`. Limits are 1–50; unknown fields and invalid cursors are rejected. Keyset order is closing time descending, then lot ID descending. Archive cursors cannot be used as active-catalogue cursors.

Only closed lots with a past closing time and a currently paid invoice qualify. Unsold, unpaid, refunded and cancelled invoices are excluded. Final winning price is the paid invoice line's integer-kobo hammer amount, excluding buyer fees. No buyer, invoice, payment-reference or private-maximum data is returned. No money, bidding or settlement writes changed.

Existing indexes cover the query: `lots(status,end_at,id)` for ordering/filtering, unique `invoice_lines(lot_id)` for the paid-invoice existence lookup, and the invoice primary key. Includes use a fixed number of relation queries, with no per-lot database loop. No migration was necessary.

The page reads without caching so refunded invoices disappear on the next page request. It shows 24 cards per page with lazy thumbnails, final winning price, Sold status and closing date in Africa/Lagos. There are no bidding controls or live sockets on archive cards. Empty/invalid-link states and the existing loading/error/offline UI remain available.

## Verification

- Web and API type checks, changed-file ESLint and formatting, API/web production builds.
- Nine catalogue integration tests passed in a new isolated test database. The new case covers paid vs pending/refunded/cancelled/unsold lots, final price, private-data exclusion, pagination, invalid input and Swagger registration.
- Local browser checks at 360, 768 and 1280 px: bold email under Help, footer navigation, populated archive, no bid controls, no horizontal overflow or browser errors. Current demo had 14 paid purchases during review.
- No unrelated full application, payment or bid test suites rerun; demo records were not seeded or altered by the checks.

[Machine-readable results](review.json). Screenshots: `footer-{360,768,1280}.png` and `past-auctions-{360,768,1280}.png`.
