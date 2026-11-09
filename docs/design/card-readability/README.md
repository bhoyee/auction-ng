# Item-card readability

2026-10-27: owner requested a larger "Sell All Auctions" button, stronger titles/prices/countdowns, no visible Starting bid or percentage badge, and top-left rounded uppercase condition badges.

Focused browser review confirmed 17 px/700 titles clamped to two lines, 26 px/800 prices, 18 px/800 countdowns, uppercase condition badges and no page overflow. Existing condition colours, desktop hover/focus bidding and touch-visible actions remain. Price semantics remain accessible and live freshness safeguards are unchanged.

- [360 px](home-360.png)
- [768 px](home-768.png)
- [1280 px](home-1280.png)
- [1440 px](home-1440.png)
- [Observed styles](review.json)

Changed-file lint/format, shared UI typecheck and web production build passed. The local web container is updated. Regression source was updated; automated suites remain deferred. Overall T13 acceptance remains open.
