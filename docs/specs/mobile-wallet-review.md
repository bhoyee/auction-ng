# Mobile wallet review sheets

The payment-method field opens a labelled, single-choice sheet with icons, descriptions and full-row radio targets. Nigerian card remains the default; the existing international-card and one-time hosted bank-transfer choices retain their original API paths.

Show fee and wallet credit opens a compact funding review with amount paid, processing charge and the server-quoted wallet credit. Its primary checkout action and Back to wallet remain inside the sheet. A saved funding request is displayed using its original accepted amounts and retains the same retry operation.

Show withdrawal fee retains the existing fresh available-balance check against the quoted total. Only a successful check opens the review sheet. It shows the masked receiving account, amount the bank receives, transfer fee, levy and total wallet debit. Password entry and the continuation button are inside the popup. After starting the existing request, email and optional authenticator verification remain inside that same popup.

Dismissal preserves the current pending start/draft while the screen stays mounted and exposes Resume withdrawal confirmation. Pending requests cannot be replaced by editing the amount or receiving account. Confirmed withdrawal responses close the review and refresh the existing history, overview and balance readers. No new persistence, endpoint, fee calculation, money movement or verification bypass is introduced.

Expanded form sheets measure the keyboard-constrained viewport and scroll the entire focused field into view, leaving the confirmation button outside the scrolling body. Other dialogs retain their existing layout. Six keyboard geometry cases and seven existing native-session cases pass, along with changed-file lint/format, mobile types and Android bundling. Physical-device visual/keyboard confirmation and native screenshots remain pending; no simulated browser image is presented as native verification.

**MONEY/BID CHANGE — needs human review:** this is a payment UI/step-layout change. Existing provider calls, idempotency requests, fee quotes, insufficient-funds validation and password/email/authenticator requirements remain authoritative and unchanged.
