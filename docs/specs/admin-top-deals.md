# Admin Top Deals and staff sign-in

Owner approved 28 October 2026. This is a focused part of T15; it does not deliver the rest of the operations dashboard.

## Use the local preview

The buyer site is http://localhost:3300 and staff workspace is http://localhost:3301. Docker Desktop must be running. The app containers and additive migrations are updated by this task; existing demo records are preserved. No default staff password or public staff registration exists.

1. Open PowerShell and enter the project:

   ```powershell
   cd "C:\Users\bhoyee-pc\Desktop\auction-ng"
   ```

2. Create your own staff account in the demo database:

   ```powershell
   docker compose --env-file .env.demo -f docker-compose.yml -f infra/docker/demo.compose.yml exec api pnpm --filter api staff:setup
   ```

3. Enter your name, a new staff email and a password of 15–128 characters. The password is hidden while typing. Existing accounts are refused, so a buyer account can never become an administrator through this command.
4. On your phone, open Google Authenticator and add an account using a setup key. Use the private key shown in your terminal, with time-based codes. Do not send the key, password or codes in chat or commit them to Git. Enter the current six-digit code in the terminal to finish setup. Nothing is saved until the code is confirmed.
5. Wait for the next code, then open http://localhost:3301 and sign in with your staff email, password and current authenticator code. A code can only be used once. Use automatic time on your phone if codes are rejected.
6. Find a lot by its full reference, or use Next/Previous. Tick **Feature in Top Deals**, enter its **Display order**, then choose **Save selection**. Lower numbers appear first; use 1, 2, 3, etc. for a clear sequence. Uncheck and save to remove a selection.
7. Open the buyer home page or http://localhost:3300/top-deals. Only eligible selections appear. The home page silently checks for changes every 15 seconds; no manual refresh is needed.

For a non-Docker development database, `pnpm db:migrate` then `pnpm staff:setup` uses the local `.env` database. Do not confuse that database with the separate `.env.demo` preview.

## Selection rules

- Shared rules live in `packages/shared/src/merchandising.ts`.
- `is_top_deal` defaults to false. `top_deal_order` is an integer from 0 through 9999. Ties use the lot UUID in ascending order; order values are intentionally not unique.
- Staff may preselect upcoming lots. Buyers see only open/closing lots with more than 20 minutes remaining. At or below 20 minutes, the lot appears only in Closing now. Ended/cancelled lots disappear automatically. The database flag may remain for history; it never overrides eligibility.
- Unselected stock never fills gaps automatically. Empty selections produce an honest empty state rather than invented deals. The home rail retains its bounded size and non-repeating lot/photo rules.
- Curation may update only the selection and order. It does not edit active auction prices, bid rules, fees or closing times. A changed version causes HTTP 409 and requires reload; concurrent edits cannot overwrite each other silently.
- Public curation is read from PostgreSQL, with a `(is_top_deal, top_deal_order, id)` index and keyset pagination. Home fetches the first bounded curated page separately, so selected lots outside the normal first 150 browse results can still appear. The full Top Deals page is paginated.

## Staff authentication and account data

This replaces the earlier SSO requirement at the owner's explicit request. Buyer email verification remains unchanged. All staff endpoints require a staff session established with both factors; only active administrators can curate Top Deals. Other staff roles and buyers are denied.

Staff passwords use native Node scrypt with unique salts and N=32768, r=8, p=3, an [OWASP-listed password-storage configuration](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Authenticator secrets are random 160-bit keys encrypted with the existing AES-256-GCM storage helper. TOTP follows [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238), using six digits, 30-second steps and a one-step clock window. A locked credential row stores the last accepted counter, preventing code reuse even under simultaneous requests. Setup also consumes its confirmation code.

Staff access tokens stay in memory. The separate `auction_staff_refresh` cookie is HttpOnly, SameSite=Strict and scoped to `/auth/staff`; Secure is required outside local development. Sessions have a fixed eight-hour expiry; refresh credentials rotate and replay revokes the family. `auction-ng-staff-device` stores only a browser UUID. Passwords, authenticator codes, tokens and setup keys are never application log fields. The setup key is deliberately handed to the operator once in an interactive terminal, not written to a file.

Set `STAFF_WEB_ORIGINS` to the allowed staff origin(s), and also include those origins in `AUTH_WEB_ORIGINS`. Production requires HTTPS, suitable same-site API/staff origins and a non-local auth mode. No new third-party service/dependency was added.

Two new additive migrations add merchandising columns/index/check, a `staff_credentials` table and the `auth_sessions.staff_mfa` marker. Full columns, types, foreign keys, checks and indexes are in [database-schema.md](database-schema.md). The credential table has one row per user, with a restrictive user foreign key, password hash, encrypted TOTP secret, nonnegative nullable last counter and creation time. No money/ledger migration is included.

Account recovery, password/MFA reset, broader staff account management and the rest of T15 remain open. Future reset flows must revoke existing staff sessions and preserve audit records. This security change needs human review before production release.

## API contracts

- `POST /auth/staff/sign-in`: strict staff email/password/code/web-device input; returns an access token/profile and sets only the HttpOnly staff refresh cookie.
- `POST /auth/staff/refresh`, `POST /auth/staff/logout`: strict web-device input, origin checked, separate staff cookie. Buyer refresh credentials cannot substitute for staff sessions.
- `GET /admin/lots?limit=24&cursor=...&reference=...`: admin-only, bounded to 50, optional exact lot reference (indexed by its existing unique constraint), UUID keyset paging. Reads are audited.
- `PATCH /admin/lots/:id/top-deal`: admin-only `{isTopDeal, topDealOrder, expectedUpdatedAt}`. Unknown fields, bad ranges and non-UUID IDs are rejected. Changes are audited with encrypted before/after values.
- `GET /lots?topDeals=true`: public curated active lots in display order, excluding the closing window. Cursor filters are bound to the request; page limit remains 50 maximum.

All endpoints have typed API-client methods and Swagger contracts. No auth bypass, default credentials, test account or public staff signup is added to the application.

## Focused verification commands

```powershell
node scripts/check-admin-top-deals.mjs
pnpm --filter api build
node --import ./apps/api/node_modules/tsx/dist/loader.mjs scripts/check-admin-top-deals-ui.mjs
```

The checks create isolated local `auction_ng_test_*` databases and retain them. UI verification routes browser API requests to a separate in-process test API; it does not create staff users or change lots in the demo database. No unrelated full-site, payment or bid suites are rerun. CI checks remain unchanged.
