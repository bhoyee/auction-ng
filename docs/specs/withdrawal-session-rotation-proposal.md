# Withdrawal confirmation across token rotation

2026-11-05 — owner approved bounded rotation-chain binding; implemented.

## Confirmed defect

AuthService.refresh revokes the existing auth_sessions row and issues another row with the same familyId. WithdrawalService.confirm requires the draft sessionId to equal the current row ID. Therefore ordinary access-token renewal can make an unexpired draft impossible to confirm. Read-only local diagnostics found an unexpired draft with zero failed-code attempts, a revoked originating session, and exactly one active successor in the same family, on the same device/client and authenticator version with buyer MFA.

## Implemented bounded fix

Keep the immutable original draft session ID and monetary instruction. At confirmation, authenticate the current active buyer session and allow either its exact ID or a verified rotation successor: same user, family, device hash, client and authenticator version as the originating session. Require the original family lifetime and draft/code deadlines still valid. Keep user/session/wallet locks, password snapshot, email proof, one-use authenticator proof, available-balance/daily-limit checks and idempotent reservation unchanged. Do not migrate drafts to independent fresh logins or allow revoked/expired/current-version-mismatched sessions. Never mark a withdrawal successful locally.

Review start retries and bank-change challenges for the same rotation binding before changing either; do not silently broaden their policies.

## Required regression checks

- Ordinary same-device refresh permits the original unexpired draft to confirm.
- Concurrent exact confirmations create one hold and return one withdrawal.
- Independent login family, different device/client, expired or revoked successor, password change and authenticator-version change are rejected without a balance change.
- Invalid email/authenticator proof still fails; logout/replay revocation remains effective.

MONEY/BID CHANGE — needs human review.

Owner explicitly approved this correction under AGENTS.md section 10.9. The original draft session remains immutable. This changes confirmation session binding only; no payment provider calls, fees, ledger maths or bank-change policy changed. New start retries still bind their request hash to the exact original session; bank-change challenges remain exact-session-bound and are recorded follow-ups, not silently broadened by this correction.


## Verification and local preview

The new regression failed before the fix with ForbiddenException after actual AuthService.refresh. With the fix, all 41 withdrawal integration cases pass, including 12 new rotation cases: concurrent exactly-once reservation with MFA, invalid email/missing factor, separate family/device/client, expiry, logout, credential/security version changes and refresh-token replay. Twenty existing targeted mobile attempt/keyboard cases, changed-file lint, API type checks and production build pass. Tests use an isolated database and mocked Paystack; no real withdrawal or transfer was submitted. Updated the running local Docker API source/compiled service and restarted only API. Phone end-to-end confirmation remains pending.

