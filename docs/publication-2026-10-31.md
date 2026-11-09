# Wallet follow-up publication

Publishes the ten previously local commits after task/wallet-withdrawals, plus this publication record. Working branch: task/cancel-pending-deposits. No merge to main.

**MONEY/BID CHANGE — needs human review**

## Included

- Safe cancellation of withdrawal drafts/review requests before approval, with idempotent reservation release and retained history.
- Wallet funding/withdrawal UI refinements: fixed Naira prefixes, compact coloured badges, whole-row payment-method selection and confirmed silent table refresh.
- Safe Paystack transfer-access error reporting. The Starter Business rejection was observed initially; a later read-only verification on 2026-10-31 returned test-domain success for the exact original reference, NGN 49,000 amount and recipient. Paystack recorded success at 17:05:18 UTC and the local ledger settled at 17:05:21 UTC. Earlier blocked-only notes describe the initial observation, not the latest result. No live payout occurred. This confirms that particular test transfer, not production readiness.
- Audited admin-only global admission controls for new deposits/withdrawals. Existing payments and transfers continue safely; buyer actions disable through silent refresh, with immediate API enforcement.
- Owned pending deposit checkout cancellation with immutable local closure metadata and exactly-once verified late-payment credit. No cancellation refund or provider-reversal claim.
- Additive migrations, typed APIs/Swagger, database dictionary, contracts and responsive evidence.

## Validation

Targeted checks were run with each change. Latest deposit work: 16 card/transfer funding integration/concurrency tests; relevant lint/types; API/worker/web production builds; wallet and return-page checks at 360/768/1280 px. Admin wallet-control work: 43 distinct cases across affected suites and focused follow-ups, API/worker/web/admin builds and three-width browser checks. Earlier withdrawal/provider/UI outcomes are recorded alongside their contracts. No unrelated full application suite was rerun solely to publish; CI gates remain intact.

Before this record, the publication audit scanned 10 unpublished commits and 101 text blobs for configured private credentials and key patterns, and checked tracked paths for private env files, tools, dependencies, build outputs and credential files. No findings. A final scan includes this commit before push. Screenshots use synthetic browser data.

## Review evidence

- [Wallet controls](specs/wallet-controls.md), [admin/buyer screenshots](design/admin-wallet-controls/README.md)
- [Deposit cancellation](specs/deposit-cancellation.md), [wallet/return screenshots](design/deposit-cancellation/README.md)
- [Withdrawal contract](specs/wallet-withdrawals.md), [cancellation screenshots](design/wallet-cancellation/README.md)

Production activation, human money review, final CI and prior documented product/performance gates remain open.
