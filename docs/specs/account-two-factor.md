# Account authenticator protection

Owner approved 2026-11-01: buyers may enable or disable Google Authenticator-compatible TOTP; staff and administrators must retain it. Recovery uses single-use codes after email verification. No new dependency or external QR service.

## Buyer flow

Profile > Two-factor authentication checks the current password, emails a five-minute security code, then shows a locally rendered QR/setup key. Prove possession with the new app's six-digit code before activation. Download and save ten recovery codes; they are returned once. Each code carries 96 bits of randomness and is stored only as a user-bound keyed hash.

Once enabled, login and password recovery require the emailed code followed by an authenticator or unused recovery code. No session or password reset completes after email alone. The typed API supports browser and native clients; the native account UI remains part of T14.

Changing a password additionally uses a session-bound email challenge tied to the proposed password. Disabling protection, replacing an authenticator or replacing recovery codes requires current password, email verification and current authenticator/recovery proof. Replacing an app also requires proof of its new secret. Replacing/disabling invalidates previous recovery codes. Security changes fence/revoke other devices while preserving the authorising session; password changes/recovery sign out every device.

## Staff policy

Staff workspace > Account security offers authenticator replacement and recovery-code replacement. There is no disable control, and the API rejects staff disable requests. Existing password plus TOTP staff sign-in remains mandatory. Staff recovery requires password, a purpose/device-bound emailed code and an unused recovery code, and issues the normal staff MFA session. Buyer login cannot recover a staff account. Existing staff should sign in with their current authenticator and generate recovery codes before losing it; initial administrator enrolment remains the interactive `pnpm staff:setup` process.

## Wallet protection

Withdrawal and withdrawal-bank-change confirmation validate their existing owned, purpose-bound email challenge first, then consume the enrolled factor inside the same transaction as the protected action. Email alone neither reserves money nor changes the account. The existing amount, fees, limits, ownership and available-funds checks still apply. Exact confirmed retries return the existing result without consuming another code or creating a second hold. No bid, fee or ledger arithmetic changes.

MONEY/BID CHANGE - needs human review: the withdrawal confirmation authentication boundary changed. Review alongside the concurrent-retry and insufficient-funds tests before production release.

## API and security controls

- `GET /auth/security`: own enabled/mandatory policy and remaining-code count only.
- `POST /auth/security/start`: password, action and optional bound new password; returns challenge ID/expiry.
- `POST /auth/security/email`: challenge ID and email code; setup secret/URI is returned only after verification for enable/replace actions.
- `POST /auth/security/finish`: challenge ID, current proof when enrolled, and new setup code when applicable; recovery codes returned once.
- Login, password reset/change and withdrawal/bank confirmation accept the shared strict `factor` union (`authenticator` or `recovery`). Missing/invalid proof after valid email returns HTTP 422 with `TWO_FACTOR_REQUIRED`/`TWO_FACTOR_INVALID`; clients must never interpret this as a completed action.
- `POST /auth/staff/recovery/start` and `/verify`: staff-only credentials, email and single-use recovery flow, approved staff origin checks and separate HttpOnly refresh cookie.

User row locks serialise TOTP/recovery consumption across actions. Accept the existing 30-second TOTP window with one adjacent step either side, consume only strictly increasing counters, and reject reuse. Store buyer secrets and setup challenge payloads encrypted using existing environment-managed encryption keys. Secret/recovery values stay out of URLs, logs, analytics, local storage and shared session messages. QR generation happens on the buyer device. Staff may enter the setup key manually; no extra QR dependency is added to admin.

Security actions are limited to twenty per user and sixty per IP per fifteen minutes. Settings challenges expire after five minutes, allow five invalid email/factor attempts and bind user, session, action, password snapshot and authenticator version. Existing login/reset/withdrawal attempt/rate limits continue. Staff recovery has separate IP/email/global limits and five verification attempts. Definitive changes increment the authenticator version and prevent old sessions from refreshing. Admin changes and recovery-code usage are audited without secret material.

The additive migration adds `buyer_authenticators`, `auth_recovery_codes`, `account_security_challenges` and authenticator state/version columns on users/sessions. See the generated [database dictionary](database-schema.md) for every column, type, index, relation and constraint. Existing buyers stay unenrolled; existing staff TOTP credentials stay mandatory. No environment variable is added.

## Local verification

The focused integration suite covers setup, encryption/hash storage, wrong/expired/cross-session requests, HTTP validation, login/reset/password changes, staff recovery, rotation, session revocation, mobile API enforcement, rate limits and concurrent one-use factors. Withdrawal tests cover additional proof and exactly-once holds on retries. `scripts/check-two-factor-ui.mjs` exercises synthetic mocked account/setup/password/login flows at 360, 768 and 1280 px; screenshots mask setup and recovery material. This is focused validation, not a claim of a full security audit.
