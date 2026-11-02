# Mobile navigation and auction countdowns

Native Android review, 2026-11-02. The navigation has an explicit content height plus the device's bottom safe area, a distinct indigo background, yellow selected state and visible labels below icons. Labels fit narrow phones without replacing Watchlist with Saved.

| Width | Five-tab navigation / More | Shared countdown states |
| --- | --- | --- |
| 360 px | [More and Wallet link](more-360.png) | [Timers](timers-360.png) |
| 768 px | [Navigation](more-768.png) | [Timers](timers-768.png) |
| 1280 px | [Navigation](more-1280.png) | [Timers](timers-1280.png) |

[Browse with segmented photo timers](browse-360.png) and [Login destination](login-360.png). No form was submitted, OTP sent, purchase made or wallet changed. Browse uses the existing local demo catalogue; the labelled timer review is a development-only component preview with synthetic timestamps. Expo Go's Tools control is development chrome.

The five tabs are Home, Browse, Watchlist, Login and More. Login opens the existing sign-in modal and becomes Account/Profile after authentication. Wallet remains reachable from More and its existing route. More can display its navigation links while signed out; protected destination screens/API operations and profile details remain authenticated. No authentication policy changed. Removed an unrelated whitespace text node encountered when opening the existing login form so the tab action has no native text warning.

One component renders auction countdowns on Home, Browse/search, Upcoming Deals, Watching and item details, as well as the existing reusable LotCard. It uses shared day/hour/minute/second formatting and the shared closing window, larger detail digits, an explicit upcoming-launch wait, confirmed ended state and fresh-snapshot gating. Disconnects never turn an old clock into a claimed closed result. Upcoming stock no longer subscribes to live bid snapshots before launch. Private pickup-pass expiry text is not an auction timer and is unchanged.

Validation: seven targeted countdown state tests, changed-file ESLint, mobile TypeScript and Android/iOS exports pass. Android review covers full phone labels, system-gesture clearance, selected-state contrast, Browse photo timers, Login and More navigation, standard/urgent/upcoming/detail/reconnecting/ended timer states and wider layouts. Full-site, payment and bid suites were not rerun for this presentation change. T14 remains in progress; installed APK and real-phone acceptance remain separate.

The final export was repeated successfully after stopping the review emulator. Metro also excludes `apps/mobile/dist` so Windows preview watchers do not enter the generated export tree during builds. A configuration smoke check confirms that exclusion; the source tree remains watched.
