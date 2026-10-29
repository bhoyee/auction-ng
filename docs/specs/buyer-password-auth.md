# Buyer passwords, email verification and Profile

Owner approved on 2026-10-29. This supersedes buyer email-only login. Staff password/TOTP remains separate.

## Behaviour

- Signup: full name, email and a 12-128 character password, followed by a five-minute email code. A new buyer and salted password hash are created only after verification.
- Login: email/password and active buyer status checked before sending a code; a session is issued only after code proof. Status and password hash are checked again at verification.
- Forgot password: generic acknowledgement for all addresses, but mail only for existing active buyers. Verify the recovery code and provide a new password. Recovery never creates accounts or signs in automatically.
- Existing email-only buyers use Forgot password to set their first password. Existing buyer sessions are fenced and revoked during startup in batches of 50; legacy challenges are unusable. There is no OTP-only login fallback.
- Change password: authenticate and check current password; changing or resetting it fences/revokes all sessions and invalidates pending challenges. Previously accepted bids remain valid; abandoned preparations are rejected and released by existing bid maintenance.
- Profile: full name, read-only verified email, optional Nigerian phone and full address. Phone/address use authenticated encryption at rest. Saving a phone never marks it verified. Email, role and verification flags are not writable through Profile.

## API

All inputs reject unknown fields. Web requests retain approved-origin checks, HttpOnly refresh cookies and no-store responses. Mobile uses the same typed client and device-bound token protocol; native UI is still T14 work.

| Endpoint                   | Body / result                                                                                                                                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST /auth/request-code    | email, deviceId, client, purpose. login requires password; signup requires password/name; reset accepts neither. Generic challenge acknowledgement; login failures use the same credential error for missing, inactive or incorrect accounts. |
| POST /auth/verify-code     | challengeId, code, deviceId, client. Only signup/login challenges issue tokens.                                                                                                                                                               |
| POST /auth/reset-password  | challengeId, code, deviceId, client, newPassword. Recovery only; 204, clears web cookie.                                                                                                                                                      |
| POST /auth/change-password | Current authenticated buyer; currentPassword/newPassword. 204, clears web cookie.                                                                                                                                                             |
| PATCH /auth/profile        | name and optional phone/address. Email is immutable.                                                                                                                                                                                          |

New endpoints and updated bodies are documented in OpenAPI and packages/api-client. Codes are hashed, expire in five minutes, allow five attempts and cannot be reused or moved between purposes/installations. Resend invalidates older challenges. Request/email/global/IP limits remain; password changes have user/IP limits. Passwords use native Node scrypt N=32768,r=8,p=3 with 128-bit salts. No new dependency or live payment call.

## Schema and deployment

Additive migration 20261029000300_buyer_password_auth adds users.buyer_password_hash/address_ciphertext, auth_challenges.purpose/password_hash/pending_name and auth_sessions.buyer_mfa. Full column types, defaults, indexes and constraints are in database-schema.md; application table count remains 33. No data is deleted.

Apply migrations before starting the updated API. The bidding engine must be available to fence previously prepared bids; failure stops startup rather than allowing an authentication bypass. Existing users set their first password at /forgot-password. No shared password is assigned to customer accounts. The isolated demo generator uses clearly synthetic fixture credentials only; it does not change existing customer passwords.

MONEY/BID CHANGE — needs human review: authentication changes exercise existing funded-session fencing; no bid, fee, ledger or settlement algorithm changes.

## Focused validation

Run node scripts/check-admin-top-deals.mjs --buyer-auth-only for authentication, concurrency, privacy and the three password-related funded-preparation checks. Run node --import ./apps/api/node_modules/tsx/dist/loader.mjs scripts/check-buyer-password-ui.mjs after building the API and starting the local buyer web app for responsive isolated browser checks. Full-site/money suites are not required for this change; CI remains unchanged.
