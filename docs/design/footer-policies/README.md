# Footer, policy pages and cookie notice

Preview: http://localhost:3300. Public contact is `info@auctionng.com`, configurable with `SUPPORT_EMAIL` in the web environment. This setting does not configure outbound SMTP.

The footer uses the shared container, dark indigo surface and light navigation. Terms of Use, Privacy Policy and Cookie Policy have working routes and explicitly state that they are review drafts. Registered operator name/address, retention schedule and final returns/dispute terms remain to be confirmed; T21 is not complete.

The notice describes the existing authentication cookie, device identifier and temporary payment-recovery storage. There are no advertising or analytics integrations in this build. Acknowledgement lasts 180 days, syncs between tabs and can be reopened through Cookie settings. Storage failure allows dismissal for the current visit without breaking browsing.

Legal reference for the review: [NDPC's final 2025 implementation directive](https://ndpc.gov.ng/wp-content/uploads/2025/07/NDP-ACT-GAID-2025-MARCH-20TH.pdf), including its cookie-notice guidance. These drafts are implementation copy, not a completed legal compliance assessment.

## Focused verification

- Web TypeScript and ESLint for changed files; relevant production web build.
- Eight acknowledgement tests cover valid, expired, malformed and future records.
- Browser checks at 360, 768 and 1280 px: first-visit notice, details dialog, persistent dismissal, reopening from footer, all three policy routes, configured contact, no horizontal overflow or browser errors.
- No unrelated application, payment or bidding suites rerun.

Captures at each width: `footer-*.png`, `cookie-notice-*.png`, `cookie-settings-*.png`, `terms-of-use-*.png`, `privacy-policy-*.png` and `cookie-policy-*.png`. Machine-readable results: [review.json](review.json).
