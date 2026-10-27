# Top deals hover and refreshed guide artwork

2026-10-27: the owner requested the exact bottom action label "See All Auction", four desktop Top deals cards, hover/focus reveal of Bid now and updated same-name guide artwork.

Focused browser review confirmed four cards at 1280, 1440 and 1920 px; desktop Bid now opacity changes from 0 to 1 on hover and keyboard focus. At 360 and 768 px the action stays visible. All three guide images load new content-hashed AVIF files. See [review data](review.json).

| Width | Top deals | Updated guide |
| --- | --- | --- |
| 360 px | [Preview](deals-360.png) | [Preview](guide-360.png) |
| 768 px | [Preview](deals-768.png) | [Preview](guide-768.png) |
| 1280 px | [Preview](deals-1280.png) | [Preview](guide-1280.png) |
| 1440 px | [Preview](deals-1440.png) | [Preview](guide-1440.png) |
| 1920 px | [Preview](deals-1920.png) | [Preview](guide-1920.png) |

Changed-file lint/format, shared UI typecheck and the web production build passed. Only the local web container was updated. Regression test source was adjusted; automated suites remain deferred. Overall T13 acceptance remains open.
