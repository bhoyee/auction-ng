# Automatic staff-session expiry

An expired/rejected staff session returns to the existing Staff sign in screen automatically, clears dashboard section query parameters and unmounts protected dialogs and content. Normal access-token renewal remains silent; stale errors from an older token cannot sign out the renewed session.

Synthetic screenshots of the existing login screen after expiry:

- [360px](expired-360.png)
- [768px](expired-768.png)
- [1280px](expired-1280.png)

Seven targeted Playwright checks cover expiry at all three widths, protected API rejection, valid renewal, late old-token errors, temporary renewal failures up to the access deadline and permission denial. Affected ESLint/type checks and admin production build pass. No backend session lifetime, permission, MFA, payment or bid policy changes.
