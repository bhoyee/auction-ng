# Wallet workspace review

Run `node scripts/check-wallet-workspace-ui.mjs` with the buyer web app on port 3300.
The browser checks mock authenticated reads and quote responses; they do not send
payments or change real wallet balances.

Checked at 360, 768 and 1280 px:

- First-open payment choices, selection and Escape dismissal.
- Full-width funding/activity table tabs and funding cursor navigation.
- Pending-payment dialog, close/Escape controls, no-pending state and mocked
  pending/credited confirmations using the stored reference.
- Numeric amount edits, fee disclosure and integer-kobo quote input.
- Delayed, failed and recovered background reads without losing form inputs.
- Independent history failures without a false balance error.
- Persistent red refresh banner and a retry action.
- Automatic fifteen-second refresh and constrained horizontal table scrolling.
- Long sidebar and summary balances fitting inside their cards on one line.

Targeted ESLint/Prettier, web and shared UI TypeScript checks, and the buyer web
production build pass. Unrelated full-site, ledger and bidding suites were not run.

Captures: `wallet-{width}.png`, `activity-{width}.png`,
`pending-{width}.png`, `refresh-error-{width}.png`, and
`large-balance-1280.png`. `review.json` records the completed browser cases.

Local read-only socket diagnostic: a public active-lot subscription connected and
remained live for 45 seconds. No permanent disconnection was reproduced; this does
not establish the cause of the owner's intermittent signed-in reconnection.
Live prices must still pause during a genuine lost or expired connection.

Payment settlement, fees, webhook verification and bid behavior are unchanged.
T06 provider acceptance and broader T13 acceptance remain open.
