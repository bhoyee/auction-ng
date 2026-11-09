# Inventory navigation review

Categories and Pickup centres now live inside Inventory alongside Items. They are absent from the main sidebar. The Inventory parent remains selected while its management pages are open; existing URLs, data flow and permissions remain unchanged.

Targeted synthetic browser checks at 360, 768 and 1280px verify navigation to all three pages, current-page indication, no document overflow and no browser errors. Additional checks verify inventory-only staff cannot see setup links, setup-only staff can enter the Inventory group without seeing Items, and support-only staff have no Inventory entry. No backend or money/bid suites were rerun for this layout correction.

Captures: `items-*`, `categories-*`, `centres-*`, and `setup-only-360.png`. Existing setup CRUD/API tests remain documented in the parent feature review.
