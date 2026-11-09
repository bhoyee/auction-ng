# LotVanta mobile assets

Run `node scripts/prepare-mobile-brand.mjs` from the repository root with Node 22. It uses the existing Sharp dependency and the owner-supplied `apps/web/public/img/logo.png` and `lv-icon.png`; no new logo is invented.

`lotvanta-logo.png` is the supplied horizontal logo. `lotvanta-icon.png` is the installed app icon. `launch-wordmark.png` provides a white backing for the dark lettering; `launch-native.png` places it on the shared indigo launch canvas. `launch-tagline.png` keeps Bid. Win. Save. in the licensed local font. The native app name/icon/splash require a new installed build; Expo Go owns its launcher.

`home-phone.webp` remains the bundled, credited representative promotion described in `apps/web/public/demo/CREDITS.md`. Historical review screenshots retain the branding that was visible when captured.

Launch artwork update (2026-11-04): launch-icon.png uses a circular alpha mask to exclude the supplied icon's opaque black corners. launch-wordmark.png is a transparent white/yellow Schibsted LotVanta name for the dark launch canvas. Source logo/icon files and web/footer derivatives remain unchanged. The native splash uses launch-icon.png; rebuilding the APK is required to update it. The in-app tagline is rendered as bold text with shared typography tokens.
