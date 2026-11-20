# GiddyDeal mobile assets

Run `node scripts/prepare-mobile-brand.mjs` from the repository root with Node 22. It uses the existing Sharp dependency and the owner-supplied artwork in `packages/ui/brand/` (GiddyDeal, 2026-11-20); no new logo is invented.

`giddydeal-logo.png` is the supplied horizontal logo. `giddydeal-icon.png` is the installed app icon. `launch-wordmark.png` is the typeset white/yellow GiddyDeal name; `launch-native.png` places it on the shared indigo launch canvas. `launch-tagline.png` keeps Bid. Win. Save. in the licensed local font. The native app name/icon/splash require a new installed build; Expo Go owns its launcher.

`home-phone.webp` remains the bundled, credited representative promotion described in `apps/web/public/demo/CREDITS.md`. Historical review screenshots retain the branding that was visible when captured.

Launch artwork update (2026-11-20, GiddyDeal): launch-icon.png is the rounded GD icon with its opaque black corners masked away. launch-wordmark.png is a transparent white/yellow Schibsted GiddyDeal name for the dark launch canvas. The native splash uses launch-icon.png; rebuilding the APK is required to update it. The in-app tagline is rendered as bold text with shared typography tokens.
