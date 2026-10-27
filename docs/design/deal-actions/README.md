# Home deal actions

2026-10-27: remove pickup text from item cards, show Bid now persistently on home Top deals cards, add See all hover feedback and a centred See all auctions button beneath the rail. The new button opens Search auctions with a paginated listing even without a search term. Warehouse details remain on lot pages and in location filters.

Focused local review at 360, 768 and 1280 px confirmed visible opaque Bid now buttons, no card pickup labels, changing hover background, 24 actual search cards, no horizontal page overflow and no browser page errors. See [review data](review.json).

| Width | Home section | Search destination |
| --- | --- | --- |
| 360 px | [Preview](home-360.png) | [Preview](search-360.png) |
| 768 px | [Preview](home-768.png) | [Preview](search-768.png) |
| 1280 px | [Preview](home-1280.png) | [Preview](search-1280.png) |

Changed-file lint/format, web typecheck and production build passed. The local web container was updated. Regression test source was added; automated suites remain deferred at the owner's request. No bidding/payment rules changed. Overall T13 acceptance remains open.
