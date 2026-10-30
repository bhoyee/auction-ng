# Wallet withdrawals — implementation specification

Status: approved core policy; identity-verification and mixed-funding allocation
questions pending. No public withdrawal endpoint or external payout is enabled by
this document.

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

## Decisions still needed

1. Verify identity and bank ownership through BVN + Paystack account verification,
   or require staff verification first. The editable profile name is insufficient
   proof of identity or bank ownership. Existing `kycStatus` alone does not provide
   a durable, verified legal-name snapshot bound to a withdrawal account.
2. Approve conservative bank-first allocation of spending and reservations in
   mixed-funded wallets. Persist source eligibility through concurrent holds,
   purchases, withdrawals, releases and reversals; do not infer bank eligibility
   merely from the current available balance.

## Planned implementation

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
