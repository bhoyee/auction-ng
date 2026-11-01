# Account authenticator review

2026-11-01. Buyer Profile now includes optional authenticator protection; staff Account security retains mandatory protection. Existing brand tokens, profile hierarchy, filled actions, six-box codes, password visibility controls and accessible dialogs are reused.

Setup checks password, emailed code, then a new authenticator code. Setup QR generation stays on the buyer device with a manual-key fallback. Ten private recovery codes are shown once, can be downloaded, and require a saved-code acknowledgement before closing. Changing or disabling protection requires the existing factor after email confirmation. Staff offers replacement and recovery controls with no disable action. Nested staff dialogs keep keyboard focus within the active modal.

Login, password reset/change, withdrawal and bank-account-change flows display the extra step only after email proof succeeds. Invalid factors use red dismissible feedback; successful email verification is instructional text, not a red error. Authenticator input explains code expiry/reuse. Layouts retain 44 px targets, readable narrow-screen controls and restrained indigo/white surfaces. No new font, UI framework, tracking or dependency.

All screenshots and browser requests use synthetic mocked accounts and transactions. Magenta blocks mask setup keys, QR images and recovery material. No live buyer, staff or financial credential is captured. Backend verification is separately covered by integration tests against an isolated PostgreSQL database; mocked browser flows do not prove provider or financial settlement.

| Screen | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Buyer settings | [Phone](settings-360.png) | [Tablet](settings-768.png) | [Desktop](settings-1280.png) |
| Authenticator setup, redacted | [Phone](setup-360.png) | [Tablet](setup-768.png) | [Desktop](setup-1280.png) |
| Recovery codes, redacted | [Phone](recovery-360.png) | [Tablet](recovery-768.png) | [Desktop](recovery-1280.png) |
| Login | [Phone](login-360.png) | [Tablet](login-768.png) | [Desktop](login-1280.png) |
| Withdrawal error/retry | [Phone](withdrawal-360.png) | [Tablet](withdrawal-768.png) | [Desktop](withdrawal-1280.png) |
| Bank change | [Phone](bank-change-360.png) | [Tablet](bank-change-768.png) | [Desktop](bank-change-1280.png) |
| Mandatory staff settings | [Phone](staff-360.png) | [Tablet](staff-768.png) | [Desktop](staff-1280.png) |
| Staff recovery | [Phone](staff-recovery-360.png) | [Tablet](staff-recovery-768.png) | [Desktop](staff-recovery-1280.png) |

`scripts/check-two-factor-ui.mjs` verifies enrolment, saved-code acknowledgement, enrolled password changes, disable proof, preserved unenrolled password changes, login and password reset without automatic sign-in. `scripts/check-two-factor-actions-ui.mjs` verifies withdrawal email -> factor, invalid-proof retry, bank-change email -> factor, mandatory staff settings, nested-dialog focus and staff recovery. Both pass at 360/768/1280 px without browser errors or horizontal overflow. See the JSON review records alongside the screenshots.

Affected lint/formatting, shared/UI/client/web/admin types, root test types and API/web/admin production builds pass. The focused six-file authentication/withdrawal suite passes 95 tests, including factor concurrency and exactly-once withdrawal holds. The full application suite was not rerun; CI remains unchanged. No claim of zero vulnerabilities or a full penetration test.

To try it locally: open `http://localhost:3300/account`, choose **Enable two-factor authentication**, confirm your password and email code, scan with Google Authenticator, enter the app's current code, and save the recovery file. Staff use `http://localhost:3301` > **Account security**. Existing staff should generate recovery codes while their current authenticator still works. Native account screens remain in T14; the API already enforces enrolled factors for mobile clients.
