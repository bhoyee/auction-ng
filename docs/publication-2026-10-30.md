# Marketplace and wallet publication

Owner requested committing and pushing all current changes on 2026-10-30.
Publish `task/wallet-withdrawals`, retaining the existing commit history and the
stack based on `task/marketplace-header`. No merge or production deployment is
part of this publication.

The branch includes the accumulated buyer/header/catalogue/detail/portal updates,
staff curation/authentication, fixed-price purchases, Paystack checkout/webhooks,
notifications, wallet funding/withdrawals and protected bank changes. Their task
and decision records remain in `docs/TASKS.md`, `docs/decisions.md` and `docs/specs`.
The owner-supplied original `banner.jpeg` is retained as source artwork; the current
site uses its configured banner assets under `apps/web/public/banners`.

Publication checks scanned all 62 previously unpublished commits, including 785
text blobs, against configured private credential values and key patterns. No new
private credentials or unwanted tracked files were found. The known local
development database password example was already public in the preceding branch;
it is an example, not a production credential. `.env`, `.env.demo`, `.tools`, private
keys, dependency directories and build output remain ignored and untracked.

No code was changed for publication. Latest bank-change validation passed 18
targeted withdrawal/integration/concurrency tests, 8 email tests, relevant lint,
type checks and builds, plus the three-width popup review. Earlier task-specific
results and screenshots are retained in their corresponding specifications.
The full application suite was not rerun merely to push existing commits; CI keeps
all its existing checks. Do not infer a green CI result from a successful push.

**MONEY/BID CHANGE — needs human review**

This is a draft review stack. Production withdrawal activation, real Paystack KYC
acceptance, levy-bearing reversal reconciliation and previously recorded product
acceptance/performance gates remain open. T23 is not marked complete.
