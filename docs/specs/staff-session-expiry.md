# Staff session expiry handling

The staff workspace owns session renewal and expiry. The existing protected staff-access poll reports 401 responses to this boundary using the token that made the request. It checks renewal once; a failed renewal after a protected 401 returns staff to login. Concurrent renewal attempts share one in-flight request. Generation, token and account checks reject late responses and prevent restoring a signed-out session or switching staff identities through a refresh response.

Continue the existing renewal attempt one minute before access-token expiry. Retry temporary renewal failures while the access token remains within its original lifetime, and recheck on focus/online/visibility changes. At the local access deadline, clear the session if renewal has not installed a fresh token. Profile-only changes do not postpone renewal or reset the deadline. A confirmed 401/403 from renewal expires the session immediately; a permission denial on a protected endpoint is not itself an expired-session signal.

Expiry clears in-memory session state, security/enrollment prompts and protected dialogs, and replaces the dashboard query URL with `/`, where the existing Staff sign in screen is rendered. No manual page reload is required. Protected mutations are never replayed automatically. Refresh cookies and all server authentication, session lifetimes, permissions and optional per-account authenticator checks remain controlled by the existing backend.

Tests: `tests/e2e/staff-session-expiry.spec.ts` uses synthetic responses and a browser clock, covering expiry at 360/768/1280px, protected-API 401 rejection, successful renewal, delayed old-token failures, temporary server failure up to the deadline and permission denial. See `docs/design/staff-session-expiry` for screenshots.

## Inactivity policy (owner approved, 2026-11-26)

Staff/admin sessions now expire after fifteen minutes without accepted user
interaction, with a warning in the final minute. The eight-hour absolute limit
still starts at sign-in; neither activity nor refresh moves it. This also covers
the focused Pickup app. Buyer session policy is unchanged.

`packages/shared/src/staff-session.ts` owns these durations and strict response
schemas. `GET /auth/staff/session` returns server time, inactivity expiry and
absolute expiry without extending them. `POST /auth/staff/activity` accepts only
an empty object and records server time after checking the current staff/device
session, origin, role, account status and authenticator version. Existing staff
action rate limits apply. Client-supplied timestamps are rejected. Both endpoints
are typed, documented in OpenAPI and return no-store responses.

The staff browser reports trusted pointer, keyboard, wheel and touch interactions,
at most once every fifteen seconds. Focus, visibility, sockets, polling, timers
and automatic refresh are not activity. The warning requires an explicit Stay
signed in action; ordinary movement cannot dismiss it. Failed continuation keeps
the warning and original deadline. The absolute-limit warning offers sign-out
only. On expiry, protected content and dialogs unmount and sign-in is shown;
sleeping/offline pages check their original deadline on return. Late responses
cannot restore an expired workspace.

The additive migration stores `auth_sessions.staff_last_active_at`. Existing
sessions receive a fifteen-minute rollout grace period, capped by their existing
absolute expiry. New sign-ins initialise the timestamp with server time. Token
rotation preserves it. Activity and rotation take user/family locks in the same
order, so an accepted update cannot be lost or revive a revoked session. The
normal authentication guard and refresh endpoint reject inactive staff sessions;
realtime proofs are capped by inactivity expiry as well as token/absolute expiry.
Inactivity makes credentials unusable without changing wallet or ledger data;
existing logout/revocation fences are preserved. Routine authentication presence
signals do not create business-action audit entries or record keystrokes.

Only existing primary/family indexes are needed: all new lookups use a session
primary key. No new dependencies or environment variables are required. The
local demo migration has been applied; production needs the normal deployment
and migration. Screenshots and review are in `docs/design/staff-idle-timeout`.
