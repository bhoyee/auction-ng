# D01 visual review

The development galleries show the design system, not finished buyer screens. Owner approval of the look remains outstanding before T13.

| Width | Web overview | Complete web gallery | Lot cards | Bottom sheet | Android Expo Go |
| --- | --- | --- | --- | --- | --- |
| 360 px | [Overview](web-overview-360.png) | [Gallery](web-design-360.png) | [Cards](web-lots-360.png) | [Sheet](web-sheet-360.png) | [Native](mobile-360.png) |
| 768 px | [Overview](web-overview-768.png) | [Gallery](web-design-768.png) | [Cards](web-lots-768.png) | [Sheet](web-sheet-768.png) | [Native](mobile-768.png) |
| 1280 px | [Overview](web-overview-1280.png) | [Gallery](web-design-1280.png) | [Cards](web-lots-1280.png) | [Sheet](web-sheet-1280.png) | [Native](mobile-1280.png) |

Additional phone captures: [native cards](mobile-lots-360.png), [native dialog](mobile-dialog-360.png), [native sheet](mobile-sheet-360.png). Android captures use the existing Android 36 emulator at 160 dpi with SDK 58 Expo Go. Its floating tools button is development chrome, not an Auction NG component.

Reviewed against DESIGN.md: Schibsted Grotesk, consistent token colours, sentence case, tabular Naira amounts, distinct 4/8/12/16 px radii, flat cards with 1 px borders, shadows only on floating web elements, visible condition/status words and yellow only for live/closing feedback. No gradients, illustration, stock imagery, decorative motion, invented metrics or generic hero. Seed photos are pending and are labelled honestly.

Browser checks verify all visible controls meet 44 px targets, no horizontal overflow at any width, keyboard tabs, a trapped/restored dialog focus loop, Escape, OTP metadata, amount precision feedback, watched state, disconnected price hiding and reduced motion. AA contrast is tested for text/action pairings. Native Android checks exercised the watch toggle, opening the lot-card sheet, opening a dialog and Android back dismissal; screenshots were inspected at all three widths. iOS exports build, but an iOS simulator and VoiceOver/TalkBack session were not run on this Windows machine.

Validation: lint, typecheck, 299 unit/integration/performance tests, 18 browser checks and nine workspace builds pass. Android and iOS production exports succeed. A real production web server returns 404 for the development gallery. Existing money/bid tests and limits are unchanged: 1,000-lot close 77.425 seconds, bid p95 21.55 ms, 1,000-viewer update p95 86.92 ms and catalogue p95 26.1 ms with four SQL queries.

Open the web preview with `pnpm --filter web exec next dev --port 3310`, then visit `http://localhost:3310/design`. Native preview instructions and component contracts are in [the specification](../../specs/design-system.md). Regenerate browser captures with `pnpm test:e2e`.
