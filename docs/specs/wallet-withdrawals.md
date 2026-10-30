# Wallet withdrawals — implementation specification

Status: implementation available for local test-mode review. Production activation,
real-provider KYC acceptance and stamp-duty reversal reconciliation remain open.

## Approved by the owner, 2026-10-30

- Withdraw from available wallet funds only, never active bid/purchase reservations.
- Pay a verified Nigerian bank account belonging to the buyer.
- Require password reauthentication and a purpose-bound email code before sending.
- The buyer pays disclosed transfer fees and applicable levy. Show bank credit,
  fee/levy lines and total wallet deduction before confirmation.
- Configurable minimum bank credit: 100,000 kobo (NGN 1,000).
- Configurable daily withdrawal limit: 50,000,000 kobo (NGN 500,000).
- Bank-funded money is eligible for automatic processing; card-funded money needs
  review. Unknown funding provenance must not be treated as bank-funded.
- Start processing automatically, but do not promise instant bank credit.
- Use Paystack test credentials during development. Production activation and
  human money-code review remain separate requirements.

## Further owner approvals, 2026-10-30

BVN + bank-account verification is required before the first withdrawal. Spending
and reservations use bank-funded money before card/review money. Profile names
remain editable and are not identity evidence. Beneficiary identity is an
immutable, encrypted snapshot verified through a signed matching callback plus
provider re-fetch. Changing a saved withdrawal bank requires support.

## Implementation

1. Add shared withdrawal schemas, integer fee calculations and configurable limits
   in `packages/shared`, with table-driven tests first.
2. Add new Prisma migrations for encrypted verified beneficiary records,
   purpose-bound withdrawal challenges, source eligibility and withdrawal states.
   Include unique request/provider references and indexes for owned history,
   daily-limit enforcement and pending reconciliation. Regenerate the complete
   database dictionary.
3. Extend the existing `PaymentProvider`/Paystack adapter with account verification,
   recipient creation, transfer submission and transfer verification. Do not reuse
   incoming transaction verification as outgoing-transfer verification.
4. Keep all money movement inside LedgerService. Atomically check eligible
   available funds and the daily limit under wallet locks, reserve the complete
   deduction, consume the bound code, and record one durable request. Bind the
   challenge to user, session, recipient, amount, fees and expiry.
5. Process queued transfers with a stable provider reference. An unknown response
   remains pending: reconcile it rather than releasing funds or sending a second
   transfer. Verify webhook signatures and re-fetch outgoing transfer status,
   reference, amount, currency, environment and recipient before settlement.
6. Handle successful, failed and reversed transfers idempotently, including a
   reversal arriving after success and duplicate/out-of-order callbacks. Restore
   only the amounts confirmed refundable by the provider; retain correct fee
   accounting. Never overwrite a pending result based on a browser claim.
7. Add authenticated, rate-limited NestJS endpoints with strict Zod validation,
   owner-scoped cursor history, Swagger and typed API-client methods. Staff review
   actions require finance permissions and audit records.
8. Add the Wallet withdrawal UI using shared components: beneficiary verification,
   quote, password/code confirmation, pending/success/failure/review states and
   silent history updates. Keep bank details encrypted and masked in responses.

## Required targeted verification

Fee boundaries; limits; mixed provenance; bidding-versus-withdrawal races; parallel
withdrawals; exact retries and conflicting keys; insufficient funds; incorrect,
expired, reused or altered challenge; suspended/staff users; account ownership;
timeout after provider acceptance; forged and replayed webhooks; terminal reversal;
provider insufficient liquidity; encrypted PII; SMTP failure; owned history and
finance review. Run affected integration/concurrency tests, lint/types, relevant
builds and responsive screenshots, without unrelated full-application suites.

MONEY/BID CHANGE — needs human review.

## Provider references

- [Paystack transfer lifecycle](https://paystack.com/docs/transfers/how-transfers-work/)
- [Transfer API](https://paystack.com/docs/api/transfer/)
- [Customer identity validation](https://paystack.com/docs/identity-verification/validate-customer/)
- [Account resolution](https://paystack.com/docs/identity-verification/verify-account-number/)
- [Transfer pricing](https://support.paystack.com/en/articles/2130370)
- [Stamp duty on transfers](https://support.paystack.com/en/articles/7573314)
- [Eligible business types](https://support.paystack.com/en/articles/2128898)

Paystack requires a registered business with transfer access and sufficient
transfer balance. Its documentation describes normal processing in seconds but
allows pending bank delays. Account resolution confirms an account name; it does
not independently prove that the logged-in buyer owns it. Check provider pricing
and verification availability again when implementing and before production.

## Operational behaviour and remaining acceptance

- New bank-funded credits carry their source through ledger reservations, raises,
  captures, releases and refunds. Existing balances remain review-only: no guessed
  backfill or rewritten journal. Public refund methods still reject payout sources;
  verified payout reversals use a separate internal ledger operation.
- The daily limit counts principal confirmed during an Africa/Lagos calendar day,
  including pending/review requests; fees are additional. Terminal failed/reversed
  requests stop consuming that day's limit. The minimum is the bank credit amount.
- A separate BullMQ withdrawal worker reconciles a bounded batch every five seconds
  so provider calls do not delay auction closing. It also rotates through successful
  transfers to detect missed reversal callbacks. Unknown results keep reservations.
  A missing transfer can be retried only with its original provider reference,
  following Paystack's documented duplicate-credit protection.
- Finance/admin review is an authenticated API with existing staff MFA and encrypted
  audit records. The staff portal screen remains a separate task; no buyer can
  approve their own request. Successful/failed/reversed/declined outcomes enqueue
  unique owned bell and professional email notices with a masked account number.
- Pending quotes remain immutable. Receipts distinguish quoted charges from final
  retained fees and returned amounts. Success, failure and reversal are never inferred
  from a browser return page.
- Production defaults to WITHDRAWALS_ENABLED=false. Only test keys are accepted by
  the provider. Local ignored environment files enable test-mode previews with the
  approved minimum/daily limit. No secrets are committed.
- Read-only sandbox checks with the configured test key confirmed balance access.
  The fictional documentation examples failed account resolution (HTTP 400/422).
  This does not establish whether a real customer bank account can resolve. Real
  beneficiary/BVN acceptance still requires a valid supported sandbox flow; no fake
  verification bypass has been added.
- Paystack's public transfer API does not define whether fee_charged includes retained
  stamp duty after reversal. Failed/reversed levy-bearing requests therefore remain
  protected for reconciliation; the code does not guess that refund. This is an open
  provider-acceptance item before production or unrestricted withdrawal acceptance.
- Relevant checks cover fee bands, source allocation, concurrency, codes, ownership,
  finance review, transfer replay/recovery, receipts and notification rendering. See
  [responsive previews and validation](../design/wallet-withdrawals/README.md).

## Configuration

WITHDRAWALS_ENABLED gates sending and verification. WITHDRAWAL_MINIMUM_KOBO defaults
to 100000 and WITHDRAWAL_DAILY_LIMIT_KOBO to 50000000. Docker passes these to the API
and the enable flag to the worker. The existing Paystack webhook URL remains
/payments/webhook: no separate withdrawal webhook URL is needed. Subscribe/allow
transfer.success, transfer.failed, transfer.reversed and customeridentification
success/failure events. Provider-side transfer approvals, sufficient Paystack
balance and a registered business with transfer/KYC access are operational
prerequisites; do not weaken provider approval settings from application code.

The additive migrations are 20261030000400_withdrawal_sources,
20261030000500_withdrawals and 20261030000600_withdrawal_receipts. The generated
[database dictionary](database-schema.md) lists every new column, relation, index,
unique/check constraint and trigger. No existing data is deleted.
