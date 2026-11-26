# Pickup app

Owner-approved focused PWA, 2026-11-26. Preview at http://localhost:3301/pickup/desk. `/pickup` redirects here. This is a separate entrance to the existing staff application, not a new backend or a new staff identity system.

## Use

Sign in with the existing staff email/password and authenticator when enabled. Staff need `pickup.manage`; otherwise the queue and check-in dialog are not rendered. The API continues enforcing its existing permissions. The compact screen shows Scan or enter buyer pass, the waiting queue and the existing collection checklist. Scanning registers arrival only; collection still requires its separate confirmation. Existing refresh, storage blocking, idempotency and audit rules are unchanged.

For phone installation, deploy the admin application over HTTPS and open `/pickup/desk` on that staff host. Tap Add to home screen; Chrome offers installation when available, otherwise instructions explain Android's menu and Safari's Share menu. The home-screen icon opens directly to this page, not the full portal. Existing sessions may be resumed; sign-in returns when required. Expired sessions stay on this entrance. Localhost preview is on the PC; a phone cannot use the PC's localhost address. A LAN HTTP address is not sufficient for camera access or PWA installation.

The scoped manifest uses the existing brand icons. The service worker controls only `/pickup/`, makes network requests and shows a reconnect page on navigation failure. It never caches staff HTML, API responses, pickup codes, buyer details or credentials. A connection is required for all mutations. Camera decoding remains dependent on native browser BarcodeDetector support; unsupported devices have an explicit message and manual code entry. Real phone camera/install acceptance still needs an HTTPS deployment and physical-device review.

## Checks

Focused browser tests cover 360/768/1280px layouts, manual registration into the existing checklist, permission denial, logout, session expiry retaining the Pickup route, manifest icons and network-only worker delivery. Existing portal check-in tests still pass. Synthetic screenshots are under `../design/pickup-app/`; no real buyer passes or credentials are included. No database, ledger, payment or bid rule changes, new dependencies or new API endpoints.
