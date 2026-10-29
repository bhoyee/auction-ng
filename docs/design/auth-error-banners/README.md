# Authentication error banners

Owner correction, 2026-10-29. All sign-in, signup and password-recovery errors appear before the form inputs in a shared red banner. Includes close icon, role=alert and a ten-second dismissal timer, paused while hovered or keyboard-focused. Field values remain intact; new errors restart the timer. Browser field validation is routed into the same banner.

| Error | Phone | Tablet | Desktop |
| --- | --- | --- | --- |
| Invalid credentials | [360](login-360.png) | [768](login-768.png) | [1280](login-1280.png) |
| Rate limit | [360](rate-limit-360.png) | [768](rate-limit-768.png) | [1280](rate-limit-1280.png) |
| Incorrect code | [360](code-error-360.png) | [768](code-error-768.png) | [1280](code-error-1280.png) |
| Password mismatch | [360](signup-360.png) | [768](signup-768.png) | [1280](signup-1280.png) |
| Connection failure | [360](recovery-360.png) | [768](recovery-768.png) | [1280](recovery-1280.png) |

Focused browser checks pass at all three widths: top-of-form placement, danger-red surface, one visible banner, manual close, timed close, hover pause, keyboard-focus pause, invalid email, invalid credentials, rate limit, incorrect code, password mismatch and connection failure. No horizontal overflow or browser exceptions. All server responses in this UI check are local fixtures; no email or payment is sent.

Changed-file lint/formatting, buyer web typecheck and buyer web production build pass. No API, wallet, bid or full-site suite was rerun; no backend logic changed. Existing CI remains unchanged.

Reproduce: node scripts/check-auth-errors-ui.mjs with the buyer site running on http://localhost:3300. Browser clock controls test the dismissal without waiting ten real seconds per case.
