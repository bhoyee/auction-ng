# Mobile app promotion banner

2026-10-27: contained indigo banner with a bold headline, official App Store/Google Play badge artwork and a generic upright phone showing the current real mobile auction website. Coming soon is prominent; store badges have no fake download links. The active browsing link opens /search. The phone is explicitly labelled Mobile web preview; native T14 has not been implemented by this banner change.

Responsive previews: [360 px](banner-360.png), [768 px](banner-768.png), [1280 px](banner-1280.png). [Delivery and size review](review.json) confirms all three images load, no horizontal page overflow and a 320 px banner height.

The screenshot is captured from the local synthetic demo website; catalogue photos retain their existing credits in public/demo/CREDITS.md. [Store artwork sources](../../../apps/web/public/stores/CREDITS.md).

Changed-file lint/format, shared UI typecheck and production web build passed. Only the local web container was updated. A focused regression test was added for later execution; automated suites remain deferred. Overall T13 acceptance remains open.
