# T06 validation and local setup

2026-10-30 follow-up: the owner supplied a local test key and authorized a local tunnel. The test key is now accepted by Paystack, and a webhook-only ngrok route passed signed/forged/blocked-route connection checks. See [current URL and PowerShell instructions](specs/local-paystack-webhook.md). Actual provider payment/transfer and repeated-credit acceptance remain pending; T06 stays in progress. Historical missing-key notes below describe the original implementation review.

T06 backend is implemented on `task/t06-paystack-topup` in [draft PR #6](https://github.com/bhoyee/auction-ng/pull/6), stacked on T05. **MONEY/BID CHANGE — needs human review**. Keep T06 in progress until an actual Paystack sandbox transfer has been checked; mocked provider success is not a substitute.

## Checks completed on 2026-10-25

- `pnpm lint` and `pnpm typecheck`: passed.
- `pnpm test`: all 176 tests passed in 17 files after the owner-approved card follow-up, including concurrent service/HTTP webhook retries, crash recovery, forged signatures, fee disclosure, card issuer/owner checks, immutable accepted funding metadata and review-only refund requests. Existing shared money/rule modules retain 100% line/branch coverage; this does not claim 100% API coverage.
- `pnpm build`: passed for all applications/packages, with cache reuse for unchanged tasks. The Linux Docker build also compiled all server apps.
- `pnpm test:e2e`: all nine existing browser checks passed at 360, 768 and 1280 px. No new product screens were added.
- Fresh Docker image started successfully; all nine Auction NG services are healthy. `pnpm auth:smoke` passed against the rebuilt API, including the upfront fee quote and an empty wallet without creating funds.
- An initial run overlapped the Docker rebuild and browser checks and hit PostgreSQL timeouts. The full suite passed when run sequentially after those workloads completed; no timeouts or checks were weakened.
- The additive migration and generated dictionary cover all 24 tables, including the new consent, customer ownership and gross/fee/net fields. Application data was not reset.
- The full-history secret scan identified two intentionally invalid keys in mocked provider tests as Stripe tokens because of their shared prefixes. `.gitleaksignore` records only those two exact historical fingerprints; real keys and future changes remain scanned. Run Gitleaks with `--gitleaks-ignore-path=/repo/.gitleaksignore` when the repository is mounted at `/repo`.

## File map

- `packages/shared/src/fees.ts`, `payment-schemas.ts`: buyer-paid 1%/NGN 300 cap quote, strict account/fee/receipt contracts and Nigerian phone normalisation.
- `apps/api/src/payments/payment-provider.ts`, `paystack-provider.ts`: provider boundary, test-key enforcement, fixed HTTPS requests, signature verification, identity/account assignment and paginated transaction retrieval.
- `payment-service.ts`, `payment-controller.ts`, `app.ts`: consent/BVN capture, asynchronous account status, protected quotes and receipts, raw-body webhooks, verified net credit and reconciliation.
- `apps/api/src/ledger/ledger-service.ts`: ledger-owned read method for reconciliation receipts; ledger writes stay inside the ledger module.
- Prisma schema and additive `20261024000400_paystack_topup`: consent/policy fields, unique customer ownership and gross/fee/net amount constraint; the full 24-table database dictionary is regenerated.
- `apps/worker/src/main.ts`: nightly BullMQ reconciliation through a server-token-protected API endpoint. No direct worker ledger writes.
- Typed client, payment/provider/API/fee tests, Docker environment wiring, `.env.example`, smoke check, README and decisions updated.

## Owner-approved card follow-up

Card funding is included in T06 ahead of the original T23 outline. Buyers can fund through hosted Paystack card checkout or bank transfer; an empty/underfunded wallet still cannot reserve a bid. Releasing an outbid hold returns funds to available wallet balance, with no automatic bank/card refund.

For a NGN 10,000 local-card charge, the quote is NGN 250 processing fee and NGN 9,750 wallet credit. For an international-card charge of the same amount, it is NGN 490 fee and NGN 9,510 credit. These are accepted before hosted checkout and checked against the verified payment. The separate `refund-requests` endpoint records an encrypted, idempotent request for review without reserving or moving money; staff execution and actual external refunds are not implemented here.

Two new additive migrations add card intent metadata and database guards against changing accepted ownership, amounts, fee tier, consent and issued checkout URLs. No earlier migration was edited. The generated dictionary still covers all 24 application tables and now includes every new funding field/index/check and the intent guard description.

## Local checks without Paystack credentials

Start Docker Desktop. Open PowerShell in `C:\Users\bhoyee-pc\Desktop\auction-ng`, with Node 22 and pnpm installed as described in the README.

```powershell
pnpm.cmd db:migrate
docker compose up -d --build --wait
pnpm.cmd auth:smoke
```

The smoke check signs in through the local inbox, opens an empty wallet, checks history and verifies both bank and local-card fee quotes. It never funds that wallet. API documentation is at http://localhost:4000/docs. Buyer/admin placeholders remain at http://localhost:3300 and http://localhost:3301.

## Actual Paystack sandbox check still required

1. Sign in to your Paystack dashboard and obtain your **test secret key**. Never paste it into chat, commit it or use a live key.
2. Open the ignored `.env` file in your editor. Set `PAYSTACK_SECRET_KEY` to that test key. Set `RECONCILIATION_TOKEN` to a separate random value with at least 32 characters; use the same value for API and worker through Compose. Do not put either value into public frontend variables.
3. Run `docker compose up -d --no-build --force-recreate --wait api worker` after the current image is built. Provider-dependent endpoints are disabled until configured.
4. Use the local email sign-in flow described in the README to get a buyer session. In Swagger, request a quote and confirm the received amount, fee and net wallet credit. Submit explicit account consent with Paystack-approved test identity/bank details; do not use real personal data for a demo.
5. Poll the account-status endpoint until Paystack returns an identified customer with an assigned Test Bank account. Use Paystack's [documented demo bank](https://paystack.com/docs/payments/dedicated-virtual-accounts/#testing-dedicated-virtual-accounts-nigeria-only) to send a sandbox transfer.
6. Paystack needs an HTTPS webhook URL it can reach; localhost is not reachable from Paystack. Configure the existing test deployment's URL ending in `/payments/webhook`. A public test URL is not configured by this task; do not point a live business webhook at a local demo.
7. Verify the wallet increases by the disclosed net amount, the receipt shows gross/fee/net and repeated delivery of the same signed event does not credit again. Check the nightly reconciliation report for mismatches. An unexpected provider fee deliberately blocks automatic credit for review.

For card sandbox acceptance, use `POST /payments/card/quote`, accept the displayed breakdown in `/payments/card/initialize`, then open the hosted authorization URL and use Paystack's documented test card data there. Never enter card details into an Auction NG API request. Confirm the owned payment ID through `/payments/card/confirm` or the signed webhook, verify one net credit on retries, and check the `card` receipt. An issuer-tier or fee mismatch must block automatic credit. A separate refund request should leave the wallet balance unchanged and return `requested`, never claim that money was returned.

Only after actual card and bank sandbox checks and human money/security review should T06 be marked done. Web/mobile fee-disclosure screens remain D01/T13/T14. No new dependencies, live payments or real email delivery are introduced.
