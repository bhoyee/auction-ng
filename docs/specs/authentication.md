# Authentication — T04

## Approved scope

The owner approved email codes instead of SMS for the first implementation, using a local Docker email inbox. This replaces T04's Termii/console-OTP plan; no OTP logging exception is needed. Web and mobile use the same API. Login screens remain later UI work.

Only buyer accounts can use this email-only path. Staff accounts cannot bypass the blueprint's SSO/MFA requirement through it. Role guards are implemented and tested for future admin endpoints, but production staff authentication is not configured by T04. Supplier authentication is also unavailable through the buyer email path.

Email verification never sets `phone_verified_at`. A phone can remain absent during signup; a verified phone is still required before bidding. Nigerian phone normalization is retained as a shared helper. Future phone verification must prove control before linking a number. Existing phone-only accounts are not automatically merged based on an unverified claim.

## Endpoints

All request bodies are strict Zod schemas. Unknown fields, invalid UUIDs and invalid email/code formats return 400. Authentication responses are marked `Cache-Control: no-store`. The API documentation at `/docs` describes requests and response schemas; it is available in explicitly enabled local mode or non-production environments.

| Endpoint                  | Request                                             | Result                                                                                 |
| ------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `POST /auth/request-code` | `email`, `deviceId` UUID, `client` (`web`/`mobile`) | Generic message, challenge UUID and expiry seconds; never the code                     |
| `POST /auth/verify-code`  | `challengeId`, six-digit `code`, same device/client | Access token, expiry, own profile; refresh token only in web cookie or mobile response |
| `POST /auth/refresh`      | Device/client; mobile also sends refresh token      | Rotates credentials; reusing an old token revokes that family                          |
| `POST /auth/logout`       | Same body/transport as refresh                      | 204; revokes the family and clears the web cookie                                      |
| `GET /auth/profile`       | Bearer access token and `X-Device-Id`               | Own profile only                                                                       |
| `PATCH /auth/profile`     | Same headers; body `{ "name": "Chiamaka" }`         | Updated profile; encrypted audit record in the same transaction                        |

Web mutations on the unauthenticated auth routes require an exact allowed `Origin` and `X-Auction-Client: web`. Web refresh tokens are never accepted from JSON. The cookie is HttpOnly, SameSite=Strict, path `/auth`; it omits Secure only in explicit local mode to support localhost HTTP. Native clients send their own refresh token and do not use browser cookies. Clients must keep access tokens in memory; later mobile screens must store refresh tokens using SecureStore.

`createAuthClient(baseUrl, { client, deviceId })` in `packages/api-client` provides typed request, verify, refresh, logout and profile methods, validates responses and includes browser credentials when appropriate. A native caller must supply the returned refresh token to refresh/logout. Save a random installation UUID and use it consistently. This identifier binding is not hardware attestation and does not protect a stolen token if the identifier is stolen too.

## Codes and sessions

Emails are trimmed and lowercased for lookup; no provider-specific dot/plus rewriting is performed. Email addresses are encrypted with AES-256-GCM and located using keyed hashes. Codes use cryptographic random generation, expire in five minutes and permit at most five verification attempts per challenge. They are stored as HMACs bound to the challenge ID, never plaintext. Resending consumes older outstanding challenges for that email. Codes are bound to the requesting client and installation UUID.

Account creation, code consumption and initial session issuance are transactional. Consistent email advisory locks and challenge row locks serialize resends and verification; concurrent verification succeeds once. No wallet or ledger entries are created here.

Access and refresh tokens are opaque 256-bit random credentials, stored only as keyed hashes. Access tokens expire after 15 minutes. The absolute session family lifetime is 30 days; refresh rotation does not extend it. Refresh and logout share a family advisory lock. Old token rows are retained for replay detection. Replaying a correctly bound rotated token revokes all active descendants. Clients must serialize refresh calls; simultaneous retries can intentionally invalidate the family. A mismatched device/client cannot revoke someone else's session family.

The server loads the current user role on authenticated requests. The buyer path rejects accounts that become staff, preventing an existing buyer session from gaining staff access. Suspended buyers can manage their account; future bidding authorization must separately reject suspension and unverified phones.

## Limits and failure behavior

PostgreSQL atomic upserts enforce limits across processes/restarts:

| Scope                                                         | Limit                  |
| ------------------------------------------------------------- | ---------------------- |
| Code requests per email                                       | 3 per 15 minutes       |
| Code requests per connection IP                               | 20 per 15 minutes      |
| Code requests across the service                              | 200 per minute         |
| Verify, refresh, logout per connection IP (separate counters) | 60 per 15 minutes each |
| Profile name changes per account                              | 30 per minute          |

Each challenge also enforces its own five-attempt limit under a row lock. Limit responses use 429 and a conservative `Retry-After: 900`. Delivery failure consumes the challenge and returns a generic 503. Exception responses never serialize request bodies, Prisma errors, email addresses, codes or tokens. Forwarded IP headers are ignored; deployment must configure and test trusted proxies in T17 before public use, rather than trusting arbitrary `X-Forwarded-For` headers.

## Local delivery and later changes

`EmailProvider.sendCode()` separates authentication from delivery. `MailpitEmailProvider` uses Mailpit's HTTP API and permits only localhost or the internal `mailpit` Docker hostname. Mailpit v1.32.0 is pinned, published only on loopback port 8025 and has no external SMTP relay configured. It keeps a temporary test inbox, so restarting/recreating it can lose captured messages; request a fresh code if needed. Never use real customer addresses or sensitive messages in the shared development inbox.

Sign-in messages include branded HTML and matching plain text. The token-derived source lives in `packages/ui/emails/sign-in-email.ts`; `pnpm tokens:generate` updates the API's static JSON asset and a sync test rejects stale output. Inline styles and table layout support email clients without JavaScript, images or remote fonts. [Responsive previews](../design/t04-email/README.md) document the brand-font fallback and mailbox-testing limits.

`AUTH_MODE=local` explicitly enables this development flow. Without it, code requests and refresh fail closed with 503. There is no production email provider configured, no email is sent to an actual inbox, and no paid service was added. Later work can supply a real email adapter, or add SMS/passkeys, without changing account UUIDs. Production rollout additionally needs real delivery, HTTPS/Secure cookies, trusted-proxy configuration, staff SSO/MFA and the appropriate wallet authorization; T04 does not claim these are ready.

The three new authentication tables and optional phone fields are documented with all columns, relations, constraints and indexes in [the database dictionary](database-schema.md). Test databases are isolated and deliberately retained under the existing no-data-deletion rule. Expired challenge/session/rate-limit retention and key rotation need an explicit production policy before launch.

Mailpit API reference: [official documentation](https://mailpit.axllent.org/docs/api-v1/).
