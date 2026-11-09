# Admin-controlled Top Deals review

Staff preview: http://localhost:3301. Buyer selection: http://localhost:3300/top-deals. [Account setup and rules](../../specs/admin-top-deals.md).

The screen uses shared Schibsted Grotesk, indigo tokens, labelled controls and flat bordered editor rows. At 360 px the row controls stack; desktop uses a denser row. Account creation is an interactive operator step, not public registration.

Verification covers password plus TOTP, one-use codes, wrong/inactive/buyer credentials, role denial, separate HttpOnly staff cookies, device binding, session rotation/logout, order and eligibility, optimistic edits, encrypted audit, pagination and schema documentation. No money or bid processing logic changed.

54 focused tests passed: 16 crypto/home-selection tests, 9 catalogue tests, 5 staff/curation integration cases, 22 existing buyer-auth/security tests and 2 schema-documentation/table checks. Final staff session separation and role-change checks were rerun with the affected auth files only. API, web, admin, shared/UI/client and test-source type checks passed, along with changed-file lint/formatting and all three affected production builds.

The affected home lifecycle browser check passed for the 20-minute boundary, end-time extensions, expiry, silent new-stock refresh and clock-resync outages. Provisioning correctly refused non-interactive execution without creating an account. Existing browser fixtures now explicitly curate their isolated stock; a NodeList conversion uses Array.from so the existing test-source TypeScript check passes without weakening its assertions. CI's full checks remain enabled, with a dedicated test database added for the new integration file.

Responsive browser review uses a new isolated database and test API, with synthetic staff credentials never saved in the repository or demo database. It checks real sign-in, selection/order save, buyer addition/removal through silent refresh, offline feedback and sign-out. Screenshots are `sign-in-*.png`, `manager-*.png` and `saved-*.png` at 360, 768 and 1280 px; machine-readable results are in `review.json`.

Production release still requires human security review and the remaining T15 operations/account-recovery work. No automatic staff account is created for the owner.
