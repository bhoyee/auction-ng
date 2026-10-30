# Withdrawal fee coverage and popup correction

Show withdrawal fees now calls the owned server quote check. Available wallet money
must cover principal plus the transfer fee and applicable levy. The server reads
under a wallet lock and returns HTTP 422 for insufficient funds; the UI presents a
solid red error without exposing password/code actions or retaining an old quote.
Exact coverage is accepted. Preview never reserves funds, creates a withdrawal or
sends an email; confirmation still rechecks in its existing transaction.

The fee button uses solid indigo with lighter hover feedback. Bank account name and
last four digits use bold text. Account replacement is pending the owner's answer
about password/email confirmation, matching the existing BVN and blocking changes
during outstanding withdrawals. No account replacement or verification bypass is
implemented in this correction.

Thirteen targeted withdrawal integration/concurrency tests pass, including exact
fee coverage, insufficient total, reserved money and changed balance after preview.
API/web type checks, targeted lint and builds pass. Run
`node scripts/check-withdrawal-ui.mjs --quote-balance` for the three-width browser
check. It uses synthetic balances/provider results, sends no money, and verifies
red failure feedback, hidden continuation, covered quotes and button hover.

**MONEY/BID CHANGE — needs human review**

- Phone: [insufficient](insufficient-360.png), [covered](covered-360.png)
- Tablet: [insufficient](insufficient-768.png), [covered](covered-768.png)
- Desktop: [insufficient](insufficient-1280.png), [covered](covered-1280.png)
