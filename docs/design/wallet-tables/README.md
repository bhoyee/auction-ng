# Wallet controls and table polish

Withdraw now sits at the top right of the balance card as a yellow action, with
dark hover feedback. It opens the existing verified-bank/password/code flow;
availability still comes from the authoritative withdrawal read and balance state.
Check pending payment remains a quieter recovery control below the card.

Withdraw funds and Transactions share the same heading style. Supporting copy is
14 px; minimum and daily-limit amounts are bold. Explain the existing bank-source
value as verified bank funding left after spending and reservations, with card and
unclassified funds still requiring review. The daily limit remains NGN 500,000.

Withdrawal history uses 10 rows per page. Funding history and Wallet activity use
20 rows per page. All three expose Previous/Next and page/per-page indicators,
retaining cursor stacks so Previous returns to the preceding page. Status colours
include yellow pending/review, green credited/sent, red failed and indigo verified.
Payment methods have distinct indigo, pale-indigo and yellow badges. Labels remain
visible so meaning does not depend only on colour.

Run `node scripts/check-withdrawal-ui.mjs --workspace-style`. The focused browser
fixture checks the balance action, heading sizes, bold limits, coloured status and
method badges, forward/backward pagination of all three tables, opening withdrawal
verification and page overflow at 360/768/1280 px. It makes no real payment/KYC calls.
Relevant lint/type checks and the web build pass; no unrelated suites are needed.

- [Phone](wallet-360.png)
- [Tablet](wallet-768.png)
- [Desktop](wallet-1280.png)
