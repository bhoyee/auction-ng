# Card metadata badges

2026-10-27: yellow UNTESTED condition badges; timer left and bid-count badge right on the same row, separated by a gap. Default timer is indigo/white, urgent is yellow/ink and final minute red/white. Narrow cards compact the badge typography. Top Deals is bold without its subtitle; See all changes from an outlined action to solid indigo/white on hover/focus.

Focused previews: [360 px](home-360.png), [768 px](home-768.png), [1280 px](home-1280.png). [Observed alignment and hover](review.json). The [UNTESTED style preview](untested-style-preview.png) changes only browser presentation for review, not actual inventory condition.

Changed-file lint/format, UI typecheck and production web build passed. Local browser review confirmed same-row badges, a visible gap, stronger hover and no page overflow. Only the local web container was updated. Automated suites remain deferred; regression source was updated. T13 acceptance remains open.
