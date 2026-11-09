# Global buyer pause notice

Screenshots at 360, 768 and 1280 px show the guest popup on the privacy-policy page, proving it is not confined to lot pages. Browser fixtures simulate the public/private Socket.IO namespaces and synthetic authentication; no actual marketplace pause, bid or purchase is submitted. Tests cover dismissal, route/reload persistence, reopening on a later pause, resume notices and the existing homepage/catalogue/detail pause behaviour. Mobile source and bundles are checked separately; physical native review requires reloading a development app or installing an updated APK.

Validation: six shared-client/contract tests, five browser checks, changed-file lint/types, the web production build and Android/iOS exports pass. The actual local guest transport was also checked read-only: it received the current public control signal and kept the popup hidden when the marketplace was live.
