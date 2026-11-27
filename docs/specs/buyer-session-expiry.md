# Buyer session expiry

Owner-requested amendment, implemented 2026-11-27: buyer sessions on the website and mobile app expire after fifteen minutes without accepted interaction. Warn during the final minute and offer **Stay signed in**. This supersedes the earlier staff-only inactivity rollout, which left buyers unchanged. Staff retain their existing independent fifteen-minute inactivity and eight-hour maximum rules.

## Server authority

`packages/shared/src/buyer-session.ts` owns the inactivity, warning, polling and activity-rate limits. The additive migration adds `auth_sessions.buyer_last_active_at`; existing sessions receive one fifteen-minute rollout grace period within their original absolute expiry. Sign-in starts this clock, rotation preserves it, and successful activity updates it using server time only. Buyer sessions retain their existing absolute lifetime; activity cannot extend it.

Normal authentication and refresh reject idle buyers. Realtime proofs expire no later than the idle, access-token or absolute deadline. `GET /auth/session` reads the server deadlines without extending them. `POST /auth/activity` accepts a strict empty object and records interaction only while the buyer/session/device remains eligible. Both require authenticated buyer access, validate the stored web/mobile client, enforce web-origin rules and return `Cache-Control: no-store`. Activity has separate per-user and per-IP rate limits. Family/user locks serialize rotation and activity, so accepted updates survive rotation and revoked or expired credentials cannot be revived.

Buyer token responses include an optional, validated `sessionState` snapshot. It gives restored/reloaded clients the existing deadline even if their first presence check fails. It contains deadlines only, never additional credentials. Existing token consumers remain compatible.

## Client behaviour

Web and native use the same deadline controller. Trusted browser interactions, app touches and native text input can report activity, at most once per fifteen seconds. Polling, socket traffic, refresh, focus and returning from the background do not count as interaction. During the warning, ordinary movement or typing cannot dismiss it; Stay signed in must be explicitly confirmed by the API. Transient failure keeps the original deadline and shows a retry error. Expiry and late responses cannot restore the old session.

The website clears protected content immediately and redirects to `/sign-in?expired=1`. A tab-local ended-session flag and the explicit expiry URL prevent automatic refresh from reopening that session during the network-round-trip margin; a new verified sign-in clears the flag. A definitive renewal rejection uses the same expiry boundary. Signed-out guests are not redirected merely because there is no refresh cookie. Browser tabs share verified renewal/expiry signals scoped to the current owner/token; an activity signal from another tab triggers a server read rather than trusting a client-supplied deadline.

The mobile app clears its in-memory session and refresh identity before asynchronous secure-storage cleanup, including when cleanup fails. The session-expired signal opens the existing sign-in screen with an explanation. Foreground checks account for elapsed background time; background renewal does not reset inactivity. Store writes and generation checks prevent late renewal from restoring an expired account. No access token or profile is added to persisted storage.

Expiry does not move money, release accepted bid holds, cancel purchases or withdraw funds. Paystack callbacks/webhooks and existing reconciliation continue independently; buyers sign in again to see their confirmed transactions. Existing password, email code, enrolled authenticator and withdrawal safeguards stay in place.

## Rollout and verification

Deploy the API migration and code together, and distribute updated mobile builds with the activity/warning integration. Older installed app versions cannot report activity and will require sign-in again after fifteen minutes. New native dependencies are not required. Local checks cover API idle/absolute boundaries, rate limits, origins, device binding, refresh/activity concurrency, restored deadlines, continuation failures, stale replies and secure-storage failures. Browser flows cover 360, 768 and 1280 pixels; evidence is in `docs/design/buyer-idle-timeout`.

Physical Android/iOS verification requires a connected device or a rebuilt installed app. Bundle exports and TypeScript checks do not prove physical-device keyboard, background or modal behaviour. No production rollout is implied by local verification.

The header uses a notification-only typed client and DTO module so the new session monitor fits the existing first-load JavaScript budget. Notification endpoints, validation, polling and delivery behaviour remain unchanged; the full buyer client delegates those methods to the same implementation.
