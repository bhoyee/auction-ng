# T13b validation and remaining work

The owner-approved email-verification policy is implemented, tested and running in the isolated local Docker preview. An active eligible buyer with verified email and sufficient wallet funds may bid without phone verification. Phone-only verification cannot satisfy the current requirement. Verification revocation and email replacement retain the existing database/Redis fencing. Signup phone collection is deferred; provider-required virtual-account KYC is unchanged.

## Passed locally

- Lint, strict typecheck and all nine production builds, including mobile exports.
- Full test command: 284 unit tests with 100% shared line coverage; 39 money/bid tests; seven realtime, eight Meilisearch and catalogue performance checks. The 1,000-lot closing test completed in 115.7 seconds.
- The 21-test browser suite covers signup, disclosed funding fees, funded email-only bidding, outbid, settlement and private pickup passes. A CI clock-listener race is fixed by freezing before verification, preserving the concurrent profile-save/token-renewal assertion.
- Production financial audit: two tests passed; mobile LCP 2.327 seconds.
- Photographic responsive audit: 25 page states at 360/768/1280 px, live-price recovery, one socket, keyboard controls, protected redirects and no broken photos or horizontal overflow. [Review captures](design/t13b/README.md); private QR credentials are masked.
- Full Git history secret scan found no leaks. Private configuration, generated build output and local reports remain ignored.
- Nine local Auction NG services are healthy. Original database counts remain 37 users, 200 lots, 31 wallets, zero ledger entries and zero invoices. The demo uses separate retained storage with 120 photographed lots and 48 accepted synthetic bids.

## Open

The photographic production audit passed once at 2.039 seconds LCP, but repeated unchanged-source runs measured 2.847 and 3.267 seconds against the unchanged 2.5-second limit. All route scripts were below 200,000 compressed bytes on the passing audit (maximum 199,200). Experimental CSS, hydration and image/font changes did not satisfy both budgets reliably and were reverted. Do not mark T13 complete or merge on the earlier passing measurement alone.

Final GitHub CI, repeatable loading performance, owner visual acceptance and human money/bid review remain required. Real Paystack and R2 provider acceptance gaps from T06/T07 remain open. T14 has not started.

**MONEY/BID CHANGE — needs human review.**

[Draft PR #18](https://github.com/bhoyee/auction-ng/pull/18). [Non-developer PowerShell preview instructions](specs/marketplace-demo.md).
