# Footer, policy pages and cookie notice

Latest owner arrangement: X, Facebook, Instagram and TikTok icons join WhatsApp below the email. Set `SOCIAL_X_URL`, `SOCIAL_FACEBOOK_URL`, `SOCIAL_INSTAGRAM_URL` and `SOCIAL_TIKTOK_URL` to actual HTTPS profile URLs. Unconfigured profiles are non-interactive icons with accessible explanations, not invented destinations. Payment marks now sit under Legal; the separate payment band, Paystack label, footer demo sentence and link underlines are removed. Fine-pointer desktop links use tighter 32 px rows; touch links retain 44 px. The demo and payment modes themselves are unchanged.

Preview: http://localhost:3300. Public contact is `info@auctionng.com`, configurable with `SUPPORT_EMAIL` in the web environment. This setting does not configure outbound SMTP.

The footer uses the shared container, dark indigo surface and compact light navigation. Owner correction: Help and Legal link groups, no Contact support block or bidding reminder. Visa/Mastercard marks and bank transfer replace plain payment pills. The configured WhatsApp link sits below the email; additional social profile URLs are pending. USSD is not advertised because it is not enabled in checkout. Terms of Use, Privacy Policy and Cookie Policy have working routes and explicitly state that they are review drafts. Registered operator name/address, retention schedule and final returns/dispute terms remain to be confirmed; T21 is not complete.

The notice describes the existing authentication cookie, device identifier and temporary payment-recovery storage. There are no advertising or analytics integrations in this build. Acknowledgement lasts 180 days, syncs between tabs and can be reopened through Cookie settings on the policy pages (removed from the footer at the owner's request). Storage failure allows dismissal for the current visit without breaking browsing.

Legal reference for the review: [NDPC's final 2025 implementation directive](https://ndpc.gov.ng/wp-content/uploads/2025/07/NDP-ACT-GAID-2025-MARCH-20TH.pdf), including its cookie-notice guidance. These drafts are implementation copy, not a completed legal compliance assessment.

## Focused verification

- Web TypeScript and ESLint for changed files; relevant production web build.
- Eight acknowledgement tests cover valid, expired, malformed and future records.
- Browser checks at 360, 768 and 1280 px: first-visit notice, details dialog, persistent dismissal, reopening from policy pages, requested footer headings, condition guidance anchor, all three policy routes, configured contact, no horizontal overflow or browser errors.
- No unrelated application, payment or bidding suites rerun.

Captures at each width: `footer-*.png`, `cookie-notice-*.png`, `cookie-settings-*.png`, `terms-of-use-*.png`, `privacy-policy-*.png` and `cookie-policy-*.png`. Machine-readable results: [review.json](review.json).
