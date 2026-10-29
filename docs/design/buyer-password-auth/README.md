# Buyer profile and password review

Owner-approved 2026-10-29 password plus email-code authentication and expanded Profile.

| Screen | Phone | Tablet | Desktop |
| --- | --- | --- | --- |
| Signup | [360](signup-360.png) | [768](signup-768.png) | [1280](signup-1280.png) |
| Email verification | [360](email-code-360.png) | [768](email-code-768.png) | [1280](email-code-1280.png) |
| Login | [360](login-360.png) | [768](login-768.png) | [1280](login-1280.png) |
| Profile and password change | [360](profile-360.png) | [768](profile-768.png) | [1280](profile-1280.png) |
| Forgot password | [360](recovery-360.png) | [768](recovery-768.png) | [1280](recovery-1280.png) |
| Recovery code and new password | [360](recovery-code-360.png) | [768](recovery-code-768.png) | [1280](recovery-code-1280.png) |
| Recovery complete | [360](recovery-success-360.png) | [768](recovery-success-768.png) | [1280](recovery-success-1280.png) |

Captures contain isolated synthetic accounts only. Password fields are masked; no real email codes or customer data are captured.

Focused checks pass: 30 auth/security tests, three funded-preparation password fencing checks and the return-path safety test. Concurrent OTP/reset use, password checks before mail, purpose/device binding, old-session rejection, refresh rotation, profile encryption and staff boundaries remain covered. The three bid checks use real isolated PostgreSQL/Redis and prove reset/change/rollout reject pending preparations and return their holds without charging the wallet.

Browser journeys pass at all three widths: signup, password then email code, verified/read-only email, phone/address save, password change, re-login, logout and recovery. No horizontal overflow or browser exceptions. Lint/formatting and affected API/web/root type checks pass; API and web production builds pass. Existing CI and all unrelated suites remain unchanged; no full-site or full financial suite was run.

Reproduce: node scripts/check-admin-top-deals.mjs --buyer-auth-only

Browser: node --import ./apps/api/node_modules/tsx/dist/loader.mjs scripts/check-buyer-password-ui.mjs (requires built API and buyer web on port 3300).

Local preview: http://localhost:3300/sign-in. Existing buyers choose Forgot password or need to set one?, verify their email and save a new password, then sign in. Profile: http://localhost:3300/account.

The API/typed client support the same protocol for mobile; native authentication screens remain part of T14. Actual SMTP delivery uses existing configuration and was not exercised by these in-memory email fixtures. Human security/funded-session review remains required before production; overall T13 acceptance is unchanged.
