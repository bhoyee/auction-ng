# Reset email validation

Owner-requested correction, 2026-10-29. Reset your password checks email syntax and active buyer eligibility before sending a code or revealing the code/new-password fields. Unknown, inactive and non-buyer accounts return 400. The email remains visible with the shared red error banner. An active buyer request advances only after successful code dispatch. Existing recovery proof, rate limits and session revocation remain unchanged.

| State | Phone | Tablet | Desktop |
| --- | --- | --- | --- |
| Unknown email rejected | [360](unknown-360.png) | [768](unknown-768.png) | [1280](unknown-1280.png) |
| Accepted reset request | [360](accepted-360.png) | [768](accepted-768.png) | [1280](accepted-1280.png) |

Nine targeted API/recovery checks pass: missing/suspended/staff rejection, no code/challenge for ineligible accounts, eligible buyer dispatch, malformed email rejection, concurrency/rate limits, first-password recovery and existing password-reset revocation. API/web type checks, changed-file lint/formatting and API/web production builds pass.

Focused browser checks at 360/768/1280 prove unknown email, malformed syntax, inactive account, delivery failure, network failure and rate limit all keep the email step without code/password fields. Only an accepted response reveals the six code boxes and new-password fields. No overflow or browser exceptions. UI responses are fixtures; no real SMTP mail is sent.

Preview http://localhost:3300/forgot-password. Reproduce browser checks with node scripts/check-reset-email-ui.mjs. The local API and web containers have been updated. No full-site, wallet or bid suite was run; CI is unchanged.

The owner explicitly replaces the earlier generic recovery acknowledgement with visible eligibility validation. Earlier review documents describe the historical flow; current contracts are in ../../specs/buyer-password-auth.md. Overall T13 acceptance remains open.
