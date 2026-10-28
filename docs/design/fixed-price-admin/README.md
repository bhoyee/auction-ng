# Fixed-price admin editor

`manager-*` and `saved-*` capture the existing compact editor plus the optional Fixed purchase price (₦) control. Leave it empty to remove the option. Price changes are explicit, versioned and audited; the hint explains item tax and zero auction premium/lot fee.

The responsive browser check signs in synthetic staff with password/TOTP, saves a price, verifies its database value and sees the resulting trophy badge on the buyer page. It runs at 360/768/1280 px with offline handling and no horizontal overflow/browser errors. `review.json` contains the recorded results. No operator account is created in the demo database.
