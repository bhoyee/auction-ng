# Mobile launch and home rebuild

Native Android review, 2026-11-02. Home screenshots use an isolated, read-only synthetic catalogue and socket fixture because Docker Desktop returned an internal error and the real API was unavailable. No real buyer, bid, wallet or inventory data was changed. Sample photos are representative test images; these captures do not prove listing accuracy, payments or live backend integration.

| Width | Home | Products |
| --- | --- | --- |
| 360 px | [Home](home-360.png) | [Product sections](products-360.png) |
| 768 px | [Home](home-768.png) | [Product sections](products-768.png) |
| 1280 px | [Home](home-1280.png) | [Product sections](products-1280.png) |

Updated branded app-loading composition: [360 px](launch-360.png), [768 px](launch-768.png), [1280 px](launch-1280.png). These show the revised indigo canvas, yellow Lucide auction illustration, outline rings, bold wordmark and bottom tagline/loading cue. These are development-only launch previews, not proof of the operating-system splash in a signed APK. Expo Go's floating Tools control is development chrome and is absent from the production application.

The installed app's splash is configured with the approved Expo plugin, shared indigo and generated Schibsted wordmark. Test the native splash in a rebuilt release APK: Expo Go controls its own initial white launcher and cannot fully reproduce it. See [Expo's splash guidance](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/).

The native asset also includes the matching yellow auction illustration. The app-loading screen has a brief gavel reveal, breathing dots and readiness-driven fade; animations stop for reduced motion. It waits for fonts/session restoration without a forced minimum splash duration. Changed-file lint, mobile types and Android/iOS exports pass. These launch-only checks do not establish T14 performance or full mobile acceptance.

Reviewed: shared brand/font, 16 px phone edges, compact header, non-overlapping search/actions, 44 px actions, restrained photo promotion, two-column phone/four-column tablet product layouts, readable condition badges, segmented timers, labelled links, fresh-snapshot price gating, no fake testimonials/statistics, loading/error/offline handling and no new money rules. In response to review, tightened the phone hero, widened condition labels, remounted rails on viewport changes and shortened the small-screen watchlist tab label to Saved (the destination remains Watchlist).

Targeted checks: native home-price display tests, affected lint/formatting, mobile types, Expo SDK compatibility/configuration and Android/iOS bundle export. T14 overall remains in progress; real-phone acceptance and the native release-splash review are separate outstanding checks.

Launch refinement verification: actual Android loading frames change with motion enabled; the loading cue stays still with native reduced motion. Cold-opening the root URL reaches the real marketplace. Reduced-motion capture: [360 px](launch-reduced-motion-360.png). The gavel/wordmark stay legible at 360/768/1280 px. No new packages, backend changes or full-site test run.
