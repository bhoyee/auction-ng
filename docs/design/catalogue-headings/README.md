# Catalogue heading alignment

Upcoming Deals and category listing titles share the exact ALL DEALS font size, weight, line height and font family. Display these headings in uppercase. Other account, help and product headings retain their existing styles.

Focused check: `node scripts/check-catalogue-headings-ui.mjs`. Compares computed heading typography with ALL DEALS at 360/768/1280, verifies uppercase text and no page overflow, and captures each page. Uses the longest existing demo category name to exercise wrapping.

| Page | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| All Deals reference | [Phone](all-deals-360.png) | [Tablet](all-deals-768.png) | [Desktop](all-deals-1280.png) |
| Upcoming Deals | [Phone](upcoming-360.png) | [Tablet](upcoming-768.png) | [Desktop](upcoming-1280.png) |
| Category | [Phone](category-360.png) | [Tablet](category-768.png) | [Desktop](category-1280.png) |

Changed-file lint, UI/web type checks, buyer production build and [browser results](checks.json) pass. Local Docker buyer preview updated. Presentation only.
