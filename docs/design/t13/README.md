# T13 responsive buyer screens

Captured from the isolated Playwright buyer journey at 360, 768 and 1280 px. All 69 captures were visually reviewed against DESIGN.md: shared Schibsted type and tokens, flat bordered surfaces, readable forms, visible focus, no horizontal overflow, explicit empty/error/offline states and no generated imagery. Category tiles retain their photo proportions; private forms use the existing 600 px reading width.

These screenshots contain synthetic test accounts, wallet funds, references and a pickup QR valid only in a separate retained test database. They contain no production credentials or customer data. Product photos are honestly marked pending; real R2 image acceptance remains open. Dialog captures show the viewport; long account-setup forms scroll within the native dialog.

| Screen or state | Phone | Tablet | Desktop |
| --- | --- | --- | --- |
| Home | [360](home-360.png) | [768](home-768.png) | [1280](home-1280.png) |
| Categories | [360](categories-360.png) | [768](categories-768.png) | [1280](categories-1280.png) |
| Category empty | [360](category-360.png) | [768](category-768.png) | [1280](category-1280.png) |
| Ending soon empty | [360](ending-soon-360.png) | [768](ending-soon-768.png) | [1280](ending-soon-1280.png) |
| Search empty | [360](search-360.png) | [768](search-768.png) | [1280](search-1280.png) |
| Lot | [360](lot-360.png) | [768](lot-768.png) | [1280](lot-1280.png) |
| Lot offline | [360](lot-offline-360.png) | [768](lot-offline-768.png) | [1280](lot-offline-1280.png) |
| Bid confirmation | [360](bid-confirm-360.png) | [768](bid-confirm-768.png) | [1280](bid-confirm-1280.png) |
| Sign in | [360](sign-in-360.png) | [768](sign-in-768.png) | [1280](sign-in-1280.png) |
| Email code | [360](email-code-360.png) | [768](email-code-768.png) | [1280](email-code-1280.png) |
| Account | [360](account-360.png) | [768](account-768.png) | [1280](account-1280.png) |
| Private sign-in gate | [360](private-sign-in-360.png) | [768](private-sign-in-768.png) | [1280](private-sign-in-1280.png) |
| Watchlist | [360](watchlist-360.png) | [768](watchlist-768.png) | [1280](watchlist-1280.png) |
| Watchlist empty | [360](watchlist-empty-360.png) | [768](watchlist-empty-768.png) | [1280](watchlist-empty-1280.png) |
| My bids | [360](my-bids-360.png) | [768](my-bids-768.png) | [1280](my-bids-1280.png) |
| Wallet | [360](wallet-360.png) | [768](wallet-768.png) | [1280](wallet-1280.png) |
| Transfer account setup | [360](transfer-account-setup-360.png) | [768](transfer-account-setup-768.png) | [1280](transfer-account-setup-1280.png) |
| Invoices | [360](invoices-360.png) | [768](invoices-768.png) | [1280](invoices-1280.png) |
| Invoice | [360](invoice-360.png) | [768](invoice-768.png) | [1280](invoice-1280.png) |
| Invoice error | [360](invoice-error-360.png) | [768](invoice-error-768.png) | [1280](invoice-error-1280.png) |
| Pickup pass | [360](pickup-pass-360.png) | [768](pickup-pass-768.png) | [1280](pickup-pass-1280.png) |
| Locations | [360](locations-360.png) | [768](locations-768.png) | [1280](locations-1280.png) |
| Bidding guide | [360](help-360.png) | [768](help-768.png) | [1280](help-1280.png) |

Reproduce with `pnpm test:e2e`. The CI artifact also contains the existing D01 and email previews. The production audit uses a separate output folder; [performance.json](performance.json) records the measured 2,485 ms mobile LCP and all 23 script budgets. This uses an isolated one-lot catalogue with a photo-pending state, not real R2 photos or a physical mobile-network measurement.
