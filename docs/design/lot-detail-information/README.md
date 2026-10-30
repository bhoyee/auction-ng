# Item information layout

The gallery is sticky below the compact header on desktop, using normal page scrolling. It becomes static on phone/tablet and is bounded by the detail columns so Similar items remains a full-width section below them.

Right-column order: bidding/optional fixed offer, Pickup location, Description, Bid History, Condition, Pickup and delivery. Description and Condition are open initially; Pickup and delivery expands on demand. History stays visible. The gallery remains clickable for full-photo inspection.

Public and personal history request ten rows per cursor page, with Previous/Next and a page label. Empty DEMO-prefixed lots show 23 clearly labelled presentation-only sample rows (10/10/3). These never become accepted bids, wallet holds, a current price, or a leader; real saved history replaces the preview. Errors and private histories never use sample rows.

Responsive previews: [phone](page-360.png), [tablet](page-768.png), [desktop](page-1280.png), [desktop while scrolling](sticky-1280.png).

Focused browser verification covers section order, sample pagination and Previous, expandable content, desktop sticky bounds, mobile stacking, Similar items and no horizontal overflow/browser errors at 360/768/1280 px. UI/web type checks, changed-file lint/format checks and buyer-web production build pass. No full-site test run.

Reproduce layout checks: `node scripts/check-lot-information-ui.mjs`. Saved-history pagination uses the isolated fixture command `node --import ./apps/api/node_modules/tsx/dist/loader.mjs scripts/check-purchase-ui.mjs --history-only --information`.

No application bids, balances, schedules or other data are modified by the layout/demo preview. Overall T13 loading-budget and owner acceptance remain open.

Saved-history verification also passed at all three widths: eleven accepted events in an isolated database, ten rows on page one, one on page two, Previous returning to page one, authenticated personal rows, guest-disabled Your Bid and no public private-limit exposure. No real demo funds or bids were changed. The phone error/retry check confirms sample rows never mask a failed history request.
