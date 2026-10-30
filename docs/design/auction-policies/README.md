# Auction policies

Added an initially open Auction policies section after Pickup and delivery. It uses the item starting price, all five shared condition badges, existing fee constants and the current wallet/fixed-price payment flow. No foreign starting-price, reserve, automatic-card, transfer or restocking claims are copied.

The owner-approved collection wording requires inspection/testing before accepting and removing the item; no returns after it leaves the collection centre. Help and draft Terms share the same copy, preserving applicable statutory rights and separate payment/refund operations. No money-moving code was changed.

Screenshots: [phone](policy-360.png), [tablet](policy-768.png), [desktop](policy-1280.png).

Targeted checks passed at 360/768/1280: placement after Pickup and delivery, current Naira fees, inspection/no-return copy, five conditions, Terms link, Help/Terms consistency, keyboard accordion toggle, no overflow or browser errors. Changed-file lint/format, UI/web types and buyer-web production build passed. No unrelated full-site or financial suites were run.

Reproduce with `node scripts/check-auction-policies-ui.mjs` against the running local Docker demo. Operator details, final legal review and broader T13/T21 launch gates remain open; this update does not complete them.
