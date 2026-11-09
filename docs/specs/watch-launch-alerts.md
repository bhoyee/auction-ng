# Watched upcoming auction alerts

Watching an upcoming item now opts its verified, active buyer into two notifications:

- **Starting soon:** once during the ten minutes before its scheduled launch. A later watch within this window receives the reminder on the next worker tick. The shared `WATCH_LAUNCH_REMINDER_MS` constant controls the window.
- **Live:** once after the server has opened bidding and cleared the pre-bid launch fence. Reaching the scheduled time alone does not qualify.

Each alert appears in the existing owned notification inbox/unread count on web and mobile, queues a branded email, and enters the Expo push outbox for eligible opted-in devices. Push taps open the inbox; opening the alert takes the buyer to the item. No APK rebuild is required for this server update. Delivery requires an installed Firebase-enabled app, notification permission, a registered active mobile session, running workers and provider connectivity. A provider ticket alone is not proof Android displayed an alert.

`watch-launch-v1` uses encrypted payloads. Unique references bind phase, lot, schedule version and buyer. Two nullable watchlist version markers, written in the notification transaction, allow bounded batches of 50 with row locks and concurrent retry protection. Removing/re-adding a watch cannot replay an already-enqueued alert for that schedule. Existing lot status/start-time and watchlist lot/user indexes support selection; notifications retain their unique reference index. The migration marks already-live watches handled so rollout cannot flood historical launch alerts.

Cancelled, archived, ended, unverified/inactive and unwatched cases do not qualify. Delivery rechecks watch and schedule eligibility before queued emails/push, suppressing stale reminders after rescheduling, launch, cancellation or unwatching. A new schedule version can receive a new reminder. A delayed worker can catch an actual live transition while that auction remains open; it never announces an already-ended auction as live. Read state stays independent of email delivery. Email is preview-only locally.

No bid activation, private limit, reservation, fee, ledger or auction deadline changes. Existing outbid/result notifications remain separate. Focused tests cover simultaneous retries, both phases, inbox counts/read links, exclusions, rescheduling/re-watch deduplication, stale delivery suppression, explicit phone text and escaped email rendering. Native physical delivery of a newly watched launch remains a device acceptance check.
