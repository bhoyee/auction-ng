# Banner copy and closing emphasis

2026-10-27: approved banner headline and supporting copy replace the previous text. General-store destinations remain. Closing now uses the same four-card desktop sizing as Top Deals, its heading is bold, and both home rails use larger red/white countdown badges.

Focused browser review confirmed 20 px/800 red countdowns on desktop (16 px on narrow cards), weight 800 on the closing heading, four desktop cards at 1280/1440 px and no horizontal page overflow. See [review data](review.json).

| Width | Banner | Top Deals | Closing layout fixture |
| --- | --- | --- | --- |
| 360 | [Preview](banner-360.png) | [Preview](top-360.png) | [Preview](closing-layout-360.png) |
| 768 | [Preview](banner-768.png) | [Preview](top-768.png) | [Preview](closing-layout-768.png) |
| 1280 | [Preview](banner-1280.png) | [Preview](top-1280.png) | [Preview](closing-layout-1280.png) |
| 1440 | [Preview](banner-1440.png) | [Preview](top-1440.png) | [Preview](closing-layout-1440.png) |

Closing fixtures clone browser markup for visual review only; they do not change real inventory eligibility, end times or backend data. Real Closing now remains limited to eligible imminent lots. Native app alert implementation remains part of T14, not this banner copy change.

Changed-file lint/format, shared UI typecheck and production web build passed. Only the local web container was updated. Automated suites remain deferred; regression source was updated. T13 acceptance remains open.
