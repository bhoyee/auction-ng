# Header review

Latest composition refinement: [bounded search/promotions, denser product grids and focused responsive checks](composition/README.md).

Latest wide-screen and hover refinement: [responsive widths, hover captures and targeted verification](wide/README.md).

Latest owner review amendment: WhatsApp is inside Help, the below-header demo notice is removed, and deal links align right while All categories stays left. The captures below show this deployed revision. Lint, typecheck, all 362 tests and the Docker website production build passed again; real Chromium verified both session states at 360/768/1280, menu containment, the configured contact and right-gutter alignment. The 1,000-lot check completed in 74.8 seconds. Other lot/photo/footer demo disclosures remain.

Owner-requested header refinement, 2026-10-27. Captured with Chromium against the populated local catalogue. These are header review captures; the hero and product sections are unchanged.

| State | Phone, 360 px | Tablet, 768 px | Desktop, 1280 px |
| --- | --- | --- | --- |
| Signed out | [View](home-signed-out-360.png) | [View](home-signed-out-768.png) | [View](home-signed-out-1280.png) |
| Signed in, synthetic account | [View](home-signed-in-360.png) | [View](home-signed-in-768.png) | [View](home-signed-in-1280.png) |

Open menus: [phone Help](help-menu-360.png), [desktop Help](help-menu-1280.png), [phone categories](categories-360.png), [desktop categories](categories-1280.png).

Reviewed for horizontal overflow, type hierarchy, spacing, touch controls, visible focus, menu clipping, truthful demo labels and working navigation. Browser checks cover both session states, Help/category/account menus, Escape, the configured WhatsApp destination, the populated All deals page and FAQ content. No external WhatsApp message was sent. All displayed funds and products belong to the isolated synthetic demo.

[Configuration and behaviour](../../specs/marketplace-header.md). Owner visual acceptance and the wider T13 performance gate remain open.

## Validation

The final sequential local run passed `pnpm build --concurrency=1` (all nine packages), `pnpm lint`, `pnpm typecheck` and `pnpm test`: 307 main tests, 39 money/bid, seven real-time, eight search and one catalogue performance test. The 1,000-lot closure check completed in 134.6 seconds. Earlier competing builds caused a Prisma generation conflict and a search startup timeout; both passed on the final sequential run without changing checks or limits.

The deployed Docker header passed real-browser checks in both session states at all three widths. Nine deployed public/account routes stayed below the unchanged 200,000-byte initial compressed-JavaScript limit; the largest measured 196,888 bytes. The web container was recreated independently; the 120-lot demo storage and auction services were retained. Secret scanning passed; private environment files and local reports remain ignored.

[Draft PR #21](https://github.com/bhoyee/auction-ng/pull/21). The existing T13 photographic mobile LCP issue remains open; this header review does not claim a fresh Lighthouse pass or complete the wider landing-page task.
