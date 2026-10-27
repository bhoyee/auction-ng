# Wide-screen layout and header hover review

Owner request, 2026-10-27: widen the buyer layout on large monitors, retain laptop sizing and show clear hover feedback on Help, Sign in, Create account, All categories, All deals, Top deals and Ending soon.

| Viewport | Measured content width | Capture |
| --- | --- | --- |
| 360 | 328 | [Phone](layout-360.png) |
| 768 | 720 | [Tablet](layout-768.png) |
| 1280 | 1232 | [Small desktop](layout-1280.png) |
| 1366 | 1240 | [Laptop](layout-1366.png) |
| 1440 | 1240 | Retains the laptop cap |
| 1536 | 1440 | Larger-screen breakpoint |
| 1920 | 1800 | [Full HD](layout-1920.png) |
| 2560 | 1800 | [Large monitor](layout-2560.png) |

Hover captures: [Help](hover-help.png), [Sign in](hover-sign-in.png), [Create account](hover-create-account.png), [All categories](hover-categories.png), [All deals](hover-all-deals.png), [Top deals](hover-top-deals.png), [Ending soon](hover-ending-soon.png).

The seven controls change background on mouse hover, show pointer cursors and use restrained 150 ms transitions. Reduced motion disables their movement and transitions. Menu links remain keyboard operable with visible focus. Shared tokens own the wide-screen dimension; form/reading maximum widths remain constrained.

Only relevant local verification ran, as requested: ESLint on the changed TypeScript/generator, Prettier on changed files, shared UI package typecheck, production Docker web build and Chromium checks for these eight viewport sizes/seven hover controls, reduced motion and no horizontal overflow. [Measured widths](results.json). Existing wallet/bid/full-site suites were not rerun; CI remains unchanged. The local web container is healthy. These screenshots use retained synthetic demo inventory.

Broader T13 visual acceptance and its existing mobile LCP gate remain open. This review does not claim a new Lighthouse audit.
