# Staff password changes

Staff open their avatar menu, Account security, then Change password beneath the
two-factor settings. The form collects the current password and a matching new
password (15–128 characters), then verifies a six-digit email code. Enrolled
accounts must additionally supply their authenticator or a single-use recovery
code. Authenticator enrollment remains optional and personal.

`POST /auth/staff/change-password` accepts the strict shared
`staffPasswordChangeSchema`: `currentPassword`, `newPassword`,
`securityChallengeId`, and optional `factor`. It requires the authenticated staff
session, device header, approved browser origin and staff web-client header. The
existing account-security challenge is bound to the session, purpose, current
credential state and chosen new password. An unverified, expired, consumed or
foreign-session challenge cannot authorize the change.

The server rechecks active staff membership, the session and the unchanged
credential under transaction locks. It consumes proof, fences and revokes all
of that user's sessions, changes only their staff credential, consumes pending
authentication/security challenges and records `staff.password_changed` in the
audit log. Concurrent attempts cannot change the password twice. Other users'
credentials and sessions remain unchanged. Successful responses are 204,
no-store, and clear the staff refresh cookie. The portal returns to staff sign-in
with a success message.

Requests are limited to five per user and twenty per IP in fifteen minutes,
in addition to the existing challenge/email/factor limits. Passwords and codes
are never recorded in audit payloads. An uncertain network outcome does not
automatically retry or claim success; the form directs the user to sign in to
check. No dependency, environment variable or database migration is required.

Verification: isolated database staff-password and existing two-factor tests;
targeted browser tests for matching passwords, email errors, enrolled factor,
success/sign-out and layouts at 360, 768 and 1280 pixels. Screenshots use synthetic
accounts and masked synthetic passwords in `docs/design/staff-password-change`.
