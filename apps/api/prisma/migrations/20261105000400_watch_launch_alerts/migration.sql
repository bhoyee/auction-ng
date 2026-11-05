ALTER TABLE watchlist
  ADD COLUMN launch_reminded_version integer,
  ADD COLUMN live_notified_version integer,
  ADD CONSTRAINT watchlist_launch_versions_check CHECK (
    (launch_reminded_version IS NULL OR launch_reminded_version >= 0) AND
    (live_notified_version IS NULL OR live_notified_version >= 0)
  );

-- Do not send historical launch alerts for auctions already live at rollout.
UPDATE watchlist w SET live_notified_version=l.schedule_version
FROM lots l WHERE l.id=w.lot_id AND l.status <> 'scheduled';

-- Existing lots_upcoming_start_idx and watchlist_lot_id_user_id_idx support
-- the bounded status/start-time join; notification.reference is unique.
