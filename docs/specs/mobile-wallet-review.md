# Mobile wallet review sheets

The payment-method field opens a labelled, single-choice sheet with icons, descriptions and full-row radio targets. Nigerian card remains the default; the existing international-card and one-time hosted bank-transfer choices retain their original API paths.

Show fee and wallet credit opens a compact funding review with amount paid, processing charge and the server-quoted wallet credit. Its primary checkout action and Back to wallet remain inside the sheet. A saved funding request is displayed using its original accepted amounts and retains the same retry operation.

Show withdrawal fee retains the existing fresh available-balance check against the quoted total. Only a successful check opens the review sheet. It shows the masked receiving account, amount the bank receives, transfer fee, levy and total wallet debit. Password entry and the continuation button are inside the popup. After starting the existing request, email and optional authenticator verification remain inside that same popup.

Dismissal preserves the current pending start/draft while the screen stays mounted and exposes Resume withdrawal confirmation. Pending requests cannot be replaced by editing the amount or receiving account. Confirmed withdrawal responses close the review and refresh the existing history, overview and balance readers. No new persistence, endpoint, fee calculation, money movement or verification bypass is introduced.

Expanded form sheets measure the keyboard-constrained viewport and scroll the entire focused field into view, leaving the confirmation button outside the scrolling body. Other dialogs retain their existing layout. Six keyboard geometry cases and seven existing native-session cases pass, along with changed-file lint/format, mobile types and Android bundling. Physical-device visual/keyboard confirmation and native screenshots remain pending; no simulated browser image is presented as native verification.

**MONEY/BID CHANGE — needs human review:** this is a payment UI/step-layout change. Existing provider calls, idempotency requests, fee quotes, insufficient-funds validation and password/email/authenticator requirements remain authoritative and unchanged.

## Password correction and visible errors (2026-11-05)

The password may be edited after a rejected attempt. Retrying preserves the original bank, amount, accepted total and idempotency key, while replacing only the authentication proof. The server verifies the password before draft creation and excludes that proof from the monetary request hash, so correcting a password does not create a fresh withdrawal instruction. Unknown network outcomes still use that same reference. Empty passwords cannot be submitted; no credentials are persisted or logged by this correction.

Withdrawal and bank-verification errors are pinned below the popup title, outside the scrolling body. Failures dismiss the keyboard; a new confirmation clears the previous error. Email/authenticator requirements remain unchanged. Six focused mobile attempt/message tests, six keyboard regressions and one isolated API/concurrency regression pass, with lint/types and Android bundle checks. The integration case verifies no draft for a rejected password, exactly one draft for concurrent corrected retries, and unchanged balances after an invalid email code. Native visual confirmation remains pending.

## Transaction refresh correction (2026-11-05)

Read polling now follows navigation focus, stops for hidden screens and ignores late results after disposal. Only the selected Wallet transaction tab polls; returning to the screen or foreground resumes reads. Overlapping interval requests are prevented. Last confirmed data remains visible on transient failures; existing access-error clearing and session ownership isolation remain intact.

History errors name Funding history or Wallet activity and distinguish network, session, rate-limit, server and unexpected-response failures without exposing raw error details. Read-only checks of the running demo API validated funding/activity pages; current rate-limit counts were below limits. The original intermittent failed request was not reproduced, so rate limiting is not asserted as its cause. Physical-phone confirmation remains pending.

Sixteen targeted polling/error tests, changed-file lint, mobile types and Android bundling pass. Full-suite shared coverage collection is not applicable to these isolated mobile tests; CI configuration and thresholds remain unchanged. No ledger, payment, withdrawal, provider or authentication rules changed.


## Confirmation diagnostics (2026-11-05)

Owner reports correct email/authenticator codes still fail. Replace the blanket code-error message with safe classification of existing API factor codes and HTTP statuses: single-use authenticator rejection, missing factor, email challenge rejection/expiry, session, conflict, rate limit and server/network uncertainty. Retain the same draft on retry and never infer success or change authentication/ledger behaviour. Fourteen targeted attempt/message tests plus lint/mobile types pass. Exact device rejection remains unconfirmed pending the user's error message; no real confirmation or transfer was submitted.
