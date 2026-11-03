# Responsive mobile home shortcuts — implementation awaiting visual review

2026-11-03, owner requested. Product layout is unchanged: two home grid cards across phones and four from 768 px; the page scrolls vertically and existing product rails retain horizontal scrolling.

The shopping shortcuts now use indigo/yellow/tinted tiles with Lucide icons and complete, two-line labels. Each has a minimum 88 px width scaled up for larger system text. Tiles expand to fill a wider row; when their measured content exceeds the available width, the row scrolls horizontally and displays a Swipe to explore hint. Existing destinations and the signed-in My bids shortcut remain unchanged. The condition badge minimum width was reduced slightly to leave more room beside its 44 px watch control on narrow cards.

Changed-file lint and mobile TypeScript pass. No dependency, image, backend, price or bid rule changed. No broad test suite was run for this presentation correction.

Required native visual review is pending. C: had approximately 1.2 GB free after the earlier Docker filesystem incident. The emulator and bundle exports were intentionally not started under that constraint. Do not mark this correction fully verified until reviewing 320/360/768/1280 px layouts, horizontal swipe, larger text, full labels and existing route actions, then attaching the 360/768/1280 px captures. T14 overall remains in progress.
