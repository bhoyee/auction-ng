# Withdrawal receipt colour correction

Use the shared emphasized status banner: indigo with white text for review/pending,
green for success and red for failure. Back to wallet uses the solid indigo primary
button and lighter indigo hover state. No payment processing or review rules change.

Targeted validation: component/script lint, web type check and production build;
`node scripts/check-withdrawal-ui.mjs --receipt-style` verifies review-banner colour,
solid button colour, hover feedback and dialog closing at all three widths. Fixtures
do not send payments or email. Screenshots reviewed against shared brand rules.

- [Phone](review-360.png)
- [Tablet](review-768.png)
- [Desktop](review-1280.png)
