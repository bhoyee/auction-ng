# Email verification before bidding

Owner approved this interim policy on 2026-10-26. Verified email replaces the earlier phone-verification gate. Phone collection and verification come later; email verification never changes `phoneVerified`.

| Buyer state                                                     | Can bid? |
| --------------------------------------------------------------- | -------- |
| Active buyer, verified email, sufficient available wallet funds | Yes      |
| Verified email, insufficient available wallet funds             | No       |
| Unverified email, including an account with a verified phone    | No       |
| Staff, supplier, suspended account, or three active strikes     | No       |

`packages/shared/src/buyer-eligibility.ts` defines the common role/status/email rule. The API reads the authoritative database user inside the existing locked preparation transaction and checks it again before publishing the funded proof. Wallet, strike, session, idempotency and Redis acceptance checks remain authoritative on the server.

The additive `20261026000100_email_bid_eligibility` migration extends the existing eligibility-fence trigger. Removing verification or changing an already verified email hash requires `BidService.fenceEligibility()` first, under the existing user/session locks. It revokes Redis capabilities before PostgreSQL commits the change. Re-verifying the same email may refresh its verification timestamp without changing eligibility. The migration adds no tables, columns, indexes or unique constraints.

Regression tests cover email-verified buyers without phone data, rejection of phone-only verification without reserving funds, unfenced database-write rejection, and concurrent confirmation/preparation after verification is fenced. The browser financial journey now completes using an ordinary email-created buyer without a test phone-verification bypass. Demo seed buyers also use the real email-code flow.

**MONEY/BID CHANGE — needs human review.** Automated checks do not replace review of the eligibility checks, migration and revocation ordering before merging.
