# T13b buyer marketplace review

Captured from a production build with 120 photographed demo lots across 12 categories. Every page was checked at 360, 768 and 1280 px. Email verification is the current bidding requirement; phone verification comes later. Native product screens remain T14.

One populated mobile Lighthouse audit measured **2.04 s LCP**, below 2.5 s; subsequent unchanged-source runs measured **2.85 s and 3.27 s**, so the loading budget is **not consistently met**. T13 remains incomplete. Every measured route was below 200,000 compressed JavaScript bytes; the largest was **199,200 bytes**. See [measurement summary](budgets.json); complete original screenshots and Lighthouse reports remain CI artifacts. Default mobile throttling is retained.

Pickup QR credentials are masked. Offscreen regions are made visible for full-page review captures; Lighthouse uses a separate untouched page. Demo photography is representative, with [source and licence credits](../../../apps/web/public/demo/CREDITS.md). These captures are implementation evidence, not owner visual acceptance.

| Page/state             | Phone                                  | Tablet                                 | Desktop                                  |
| ---------------------- | -------------------------------------- | -------------------------------------- | ---------------------------------------- |
| account                | [360](account-360.webp)                | [768](account-768.webp)                | [1280](account-1280.webp)                |
| categories signed in   | [360](categories-signed-in-360.webp)   | [768](categories-signed-in-768.webp)   | [1280](categories-signed-in-1280.webp)   |
| categories signed out  | [360](categories-signed-out-360.webp)  | [768](categories-signed-out-768.webp)  | [1280](categories-signed-out-1280.webp)  |
| category signed in     | [360](category-signed-in-360.webp)     | [768](category-signed-in-768.webp)     | [1280](category-signed-in-1280.webp)     |
| category signed out    | [360](category-signed-out-360.webp)    | [768](category-signed-out-768.webp)    | [1280](category-signed-out-1280.webp)    |
| email code             | [360](email-code-360.webp)             | [768](email-code-768.webp)             | [1280](email-code-1280.webp)             |
| ending soon signed in  | [360](ending-soon-signed-in-360.webp)  | [768](ending-soon-signed-in-768.webp)  | [1280](ending-soon-signed-in-1280.webp)  |
| ending soon signed out | [360](ending-soon-signed-out-360.webp) | [768](ending-soon-signed-out-768.webp) | [1280](ending-soon-signed-out-1280.webp) |
| help                   | [360](help-360.webp)                   | [768](help-768.webp)                   | [1280](help-1280.webp)                   |
| home signed in         | [360](home-signed-in-360.webp)         | [768](home-signed-in-768.webp)         | [1280](home-signed-in-1280.webp)         |
| home signed out        | [360](home-signed-out-360.webp)        | [768](home-signed-out-768.webp)        | [1280](home-signed-out-1280.webp)        |
| invoice                | [360](invoice-360.webp)                | [768](invoice-768.webp)                | [1280](invoice-1280.webp)                |
| invoices               | [360](invoices-360.webp)               | [768](invoices-768.webp)               | [1280](invoices-1280.webp)               |
| locations              | [360](locations-360.webp)              | [768](locations-768.webp)              | [1280](locations-1280.webp)              |
| lot signed in          | [360](lot-signed-in-360.webp)          | [768](lot-signed-in-768.webp)          | [1280](lot-signed-in-1280.webp)          |
| lot signed out         | [360](lot-signed-out-360.webp)         | [768](lot-signed-out-768.webp)         | [1280](lot-signed-out-1280.webp)         |
| my bids                | [360](my-bids-360.webp)                | [768](my-bids-768.webp)                | [1280](my-bids-1280.webp)                |
| pickup pass            | [360](pickup-pass-360.webp)            | [768](pickup-pass-768.webp)            | [1280](pickup-pass-1280.webp)            |
| pickup passes          | [360](pickup-passes-360.webp)          | [768](pickup-passes-768.webp)          | [1280](pickup-passes-1280.webp)          |
| search signed in       | [360](search-signed-in-360.webp)       | [768](search-signed-in-768.webp)       | [1280](search-signed-in-1280.webp)       |
| search signed out      | [360](search-signed-out-360.webp)      | [768](search-signed-out-768.webp)      | [1280](search-signed-out-1280.webp)      |
| sign in                | [360](sign-in-360.webp)                | [768](sign-in-768.webp)                | [1280](sign-in-1280.webp)                |
| sign up                | [360](sign-up-360.webp)                | [768](sign-up-768.webp)                | [1280](sign-up-1280.webp)                |
| wallet                 | [360](wallet-360.webp)                 | [768](wallet-768.webp)                 | [1280](wallet-1280.webp)                 |
| watchlist              | [360](watchlist-360.webp)              | [768](watchlist-768.webp)              | [1280](watchlist-1280.webp)              |

Review covered the marketplace hierarchy, product imagery, type and punctuation, responsive cards and filters, contextual navigation, auth, wallet fee disclosure, invoices and pickup passes. Browser checks also cover live prices, a shared connection, offline masking, menus, carousel keyboard controls, search, the absence of broken photos or horizontal overflow, and protected-route redirects.

**MONEY/BID CHANGE — needs human review.** See [email eligibility and fencing](../../specs/email-bid-eligibility.md).
