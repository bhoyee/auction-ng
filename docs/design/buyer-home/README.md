# Personalised buyer homepage

Signed-in buyers see a compact first-name welcome and Watchlist/My Bids shortcuts in place of the promotional hero/guide. Closing Now, Ending Soon, Top Deals and Upcoming Deals share the existing container and cards. Empty sections stay hidden. Default sign-in/signup destination is home; explicit safe return paths still work.

| View | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Signed in | [Phone](signed-in-360.png) | [Tablet](signed-in-768.png) | [Desktop](signed-in-1280.png) |
| Signed out | [Phone](signed-out-360.png) | [Tablet](signed-out-768.png) | [Desktop](signed-out-1280.png) |

These previews use synthetic accounts/catalogue responses against local production pages, with existing demo photos. No account, bid or payment data is changed. Checked greeting/hero separation, four-card selection, no repeated live items, responsive overflow, empty upcoming removal and reappearance without navigation, and email-code login redirect to home or an explicitly requested lot. [Browser results](checks.json).

Run: node scripts/check-buyer-home.mjs. Focused unit coverage: buyer-home-collections, home-collections and web-return-path. Shared UI/web types, affected lint and production build pass.

Four-card correction: homepage rows now fit four items from 768 px. Browser assertions verify column/card widths and notification bell border, pointer, hover and dropdown interaction. Mobile stays readable. Local preview stock can be supplemented safely with node --import ./apps/api/node_modules/tsx/dist/loader.mjs scripts/prepare-demo-home-four.mjs; it accepts only the private local demo database, adds missing labelled items and an audit record, and never edits existing auctions or wallets.
