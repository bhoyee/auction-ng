# Authentication protection and visual review

Owner-requested follow-up, 2026-10-29. Preview http://localhost:3300/sign-in, /sign-up and /forgot-password.

| Screen | Phone | Tablet | Desktop |
| --- | --- | --- | --- |
| Signup | [360](signup-360.png) | [768](signup-768.png) | [1280](signup-1280.png) |
| Login | [360](login-360.png) | [768](login-768.png) | [1280](login-1280.png) |
| Unknown email rejected | [360](invalid-login-360.png) | [768](invalid-login-768.png) | [1280](invalid-login-1280.png) |
| Six-digit verification | [360](email-code-360.png) | [768](email-code-768.png) | [1280](email-code-1280.png) |
| Forgot password | [360](recovery-360.png) | [768](recovery-768.png) | [1280](recovery-1280.png) |
| Recovery verification | [360](recovery-code-360.png) | [768](recovery-code-768.png) | [1280](recovery-code-1280.png) |
| Recovery complete | [360](recovery-success-360.png) | [768](recovery-success-768.png) | [1280](recovery-success-1280.png) |
| Profile password controls | [360](profile-360.png) | [768](profile-768.png) | [1280](profile-1280.png) |

Photo-free indigo editorial panel, restrained form typography, distinct pale-indigo Back to auctions, labelled show/hide password controls and six numeric code boxes. Desktop uses the available container width; phone/tablet forms start near the top and hide the secondary editorial panel. No new imagery, dependencies or external bot provider.

37 focused authentication/security/return-path checks pass. New cases prove no mail/challenge for unknown login, no account/challenge/mail from filled signup honeypots, IP/installation caps across changing email addresses and concurrent recovery limits. Existing expiry, code reuse, password recovery, refresh rotation, profile encryption and staff-boundary checks remain.

Browser review covers all three widths: unknown login error without a code step or email delivery; password reveal/hide; six real inputs; typing, backwards deletion, full-code paste from a middle box and arrow navigation; signup/login/recovery and profile saves; no horizontal overflow or browser errors. Passwords remain masked in captures; code boxes are captured before entering the isolated test codes. No real SMTP mail is sent by these fixtures.

Affected API/web production builds, web/API/root type checks and changed-file lint/formatting pass. Full-site, wallet and bid suites were not rerun; CI is unchanged. The local API/web preview was updated.

The test command node scripts/check-admin-top-deals.mjs --buyer-auth-only covers authentication and the existing funded-session fencing checks. For UI run node --import ./apps/api/node_modules/tsx/dist/loader.mjs scripts/check-buyer-password-ui.mjs after starting the buyer site and building the API. The script writes current captures here.

Unknown recovery addresses deliberately retain a conditional response to protect account privacy; they receive no code. Honeypot, rate limiting and email verification are layered basic spam controls, not a CAPTCHA or a guarantee against sophisticated automation. Full T13 acceptance remains open.
