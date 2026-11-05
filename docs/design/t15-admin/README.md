# T15 admin dashboard review

Responsive captures at 360, 768 and 1280 px cover Overview, Inventory, Buyers, Finance, Staff, Audit and Archived records. They use synthetic API fixtures in Playwright against the production-built admin application on port 3401. No real customer or payment data appears in these images.

The first review identified wrapping sales values in overview cards; the typography was reduced and values kept on one line. Captures were regenerated after that correction. The 21 browser captures reported no page errors or document overflow. Drawer focus handling is implemented; actual staff workflows, Auctions, Pickup, Support and modal states remain part of the final review.

These screenshots are layout evidence, not proof of a live API or completed T15 acceptance.
