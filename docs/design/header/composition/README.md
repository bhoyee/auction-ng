# Responsive composition refinement

Owner-approved recommendation, 2026-10-27: keep the wide marketplace for product browsing while constraining search, promotions and forms. The shared tokens cap search at 760 px and promotions at 1,440 px; the overall wide catalogue remains capped at 1,800 px. Promotional copy uses readable line measures and balanced headings.

| Viewport | Home product columns | Listing columns | Hero width | Search width |
| --- | --- | --- | --- | --- |
| 360 | 2 | 2 | 328 | 276 |
| 768 | 3 | 3 | 720 | 720 |
| 1280 | 3 | 4 | 1232 | 645 |
| 1366 | 3 | 4 | 1240 | 653 |
| 1440 | 3 | 4 | 1240 | 653 |
| 1536 | 4 | 5 | 1440 | 760 |
| 1920 | 6 | 5 | 1440 | 760 |
| 2560 | 6 | 5 | 1440 | 760 |

Home: [phone](home-360.png), [tablet](home-768.png), [1280](home-1280.png), [laptop](home-1366.png), [1536](home-1536.png), [Full HD](home-1920.png), [large monitor](home-2560.png).

Product rows: [laptop](collection-1366.png), [1536](collection-1536.png), [Full HD](collection-1920.png), [large monitor](collection-2560.png).

Listings: [phone](deals-360.png), [1280](deals-1280.png), [Full HD](deals-1920.png), [large monitor](deals-2560.png). [Measured results](results.json).

Targeted checks cover the home and listing grids at these eight widths, search/hero caps, readable large-screen card widths, narrow Help/sign-in and horizontal overflow. Shared UI typecheck, changed token/generator lint/format and production web build passed. No unrelated full-site, wallet or bidding suites ran; CI remains unchanged. Review captures explicitly render the offscreen collection before photographing its lazy-loaded images. All stock and funds remain synthetic demo data.

Owner visual acceptance and the existing broader T13 mobile LCP gate remain open. No new Lighthouse claim is made.
