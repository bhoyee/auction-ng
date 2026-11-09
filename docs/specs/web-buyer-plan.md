# T13 implementation plan

Branch: `task/t13-web-buyer`, stacked on the owner-approved D01 branch. The owner approved the dependency pins below on 2026-10-25; implementation is in progress.

## Files and flows

- `apps/web/app`: home, category, search, lot detail/gallery, email sign-in/code entry, account, watchlist, my bids, wallet, invoices and private pickup-pass routes, with loading/empty/error/offline/success states.
- `packages/ui/web`: reusable buyer navigation, catalogue/gallery layouts, bid confirmation and wallet/invoice presentation, using the approved D01 tokens and components.
- `apps/web` client/session modules: bind the existing typed API clients and realtime hook to web React; access tokens stay in memory and rotating refresh tokens stay in the existing HttpOnly cookie. Installation IDs are not credentials.
- `apps/api/src/buyers`, `packages/shared` and `packages/api-client`: add missing ownership-checked buyer watchlist, bid-history and invoice read contracts. Use cursor pagination with at most 50 items and fixed query counts. Add indexes through a new migration only where the new query patterns require them; update Swagger and the schema dictionary if changed.
- `tests/e2e` and API tests: cover the buyer journey, authorization, retry behavior, disconnected state, privacy, responsive layouts and performance. Add an isolated test harness with synthetic users/provider outcomes; no public test bypasses or fabricated production wallet funds.
- `.env.example`, Docker web configuration and docs: document only the configuration needed to connect the UI to existing local services. Keep the local buyer/admin Docker ports 3300/3301; development review remains on a free port such as 3310.

## Existing contracts to preserve

Public catalogue metadata may be cached. Personal accounts, wallet balances, invoices and pickup tokens must never enter shared caches. Current prices come from fresh socket state, not cached starting prices. Anonymous catalogue content must label starting prices honestly; authenticated live state follows T11's existing security contract.

Direct bids remain the default and automatic limits remain an explicit choice. Use shared increments and fee calculations, disclose the total before confirmation, preserve request idempotency across retries and keep all funding/acceptance decisions on the existing server path. Verified-phone, role, suspension and available-funds checks remain enforced. Paystack fees remain buyer-paid and separately disclosed from net wallet credit. Clients never receive another buyer's private maximum.

Pickup QR codes are rendered locally from the authenticated owner's existing pass token. No external QR service, public image URL or token-bearing query string is used. Cards use staff-provided images or the honest photo-pending state.

## Approved dependencies

| Pin                   | Location         | Purpose                                        |
| --------------------- | ---------------- | ---------------------------------------------- |
| `qrcode@1.5.4`        | Web runtime      | Locally render a scannable private pickup pass |
| `@types/qrcode@1.5.6` | Web development  | Strict TypeScript definitions                  |
| `lighthouse@13.5.0`   | Root development | The explicit T13 mobile LCP acceptance check   |

Registry pins were verified. Lighthouse requires Node >=22.19, compatible with the existing Node 22.23.4 pin. These add no UI framework or paid service. AGENTS.md section 10.9 requires approval before installing new dependencies.

## Validation and remaining provider setup

Run lint, typecheck, the full test suite, all builds, browser journeys and screenshots at 360/768/1280 px. Measure the production home page with Lighthouse under mobile throttling and verify the initial JavaScript budget. Preview actions must use actual typed API contracts rather than hardcoded success responses.

T06's actual Paystack test credentials/reachable sandbox webhook and T07's real R2 acceptance remain outstanding. Automated synthetic-provider checks do not complete those provider tasks. Preserve explicit unavailable states until the relevant setup is ready; never call live payment endpoints or weaken eligibility to make the browser journey pass.
