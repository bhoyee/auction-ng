# Wallet withdrawal review

Run `node scripts/check-withdrawal-ui.mjs` with the local Docker site running at
`http://localhost:3300`. Browser fixtures simulate the provider and signed-in buyer;
they never send money, perform real KYC or send external email.

The focused review covers bank details and BVN consent, pending/confirmed identity,
the amount/fee/levy breakdown, password confirmation, six code boxes, failed-code
feedback and retry, pending-to-success updates, withdrawal history and bell counts.
The screen uses shared brand components and tokens, keyboard-accessible dialogs,
masked bank details and no horizontal overflow at 360/768/1280 pixels. It does not
promise instant bank arrival. Existing wallet contents are retained during silent
refreshes.

- Phone: [verification](verification-360.png), [quote](quote-360.png),
  [pending](pending-360.png), [success](success-360.png), [email](email-360.png)
- Tablet: [verification](verification-768.png), [quote](quote-768.png),
  [pending](pending-768.png), [success](success-768.png), [email](email-768.png)
- Desktop: [verification](verification-1280.png), [quote](quote-1280.png),
  [pending](pending-1280.png), [success](success-1280.png), [email](email-1280.png)

Validation uses only affected money/bid tests, lint/type checks, relevant builds and
this browser flow. Production remains gated by human review and the provider
acceptance issues in [the specification](../../specs/wallet-withdrawals.md).

Recorded checks: 141 affected money/bid tests passed; API, worker and web production
builds passed. The browser flow passed at all three widths, including invalid-code
retry, silent pending-to-success updates and the unread bell count. Screenshots were
reviewed for alignment, readable fee disclosure and overflow. These are synthetic
browser fixtures, not evidence of a real Paystack bank payout.
