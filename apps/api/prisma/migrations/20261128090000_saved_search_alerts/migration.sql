-- Saved-search alerts (2026-11-28, search & retention step 3).
-- A lot is checked against saved searches once per scheduled run, after it
-- is live and in the search index. Progress lives in its own table: any
-- UPDATE on lots re-queues search indexing.
CREATE TABLE saved_search_scans (
  lot_id uuid PRIMARY KEY REFERENCES lots(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  schedule_version integer NOT NULL,
  scanned_at timestamptz(3) NOT NULL DEFAULT now()
);
-- Items already live or finished when alerts switch on are not "new"; items
-- still scheduled are checked when they go live. Purged drafts drop their row.
INSERT INTO saved_search_scans (lot_id, schedule_version)
  SELECT id, schedule_version FROM lots WHERE status NOT IN ('draft', 'scheduled');

ALTER TABLE buyer_saved_searches ADD COLUMN instant_email boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN saved_search_digest boolean NOT NULL DEFAULT true;

-- One row per buyer and item: a buyer hears about an item once even when
-- several of their searches match it. Removing a saved search removes its
-- matches; nothing here moves money.
CREATE TABLE saved_search_matches (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  lot_id uuid NOT NULL REFERENCES lots(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  saved_search_id uuid NOT NULL REFERENCES buyer_saved_searches(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  matched_at timestamptz(3) NOT NULL DEFAULT now(),
  emailed_at timestamptz(3),
  seen_at timestamptz(3),
  PRIMARY KEY (user_id, lot_id)
);
CREATE INDEX saved_search_matches_search_idx ON saved_search_matches (saved_search_id, matched_at DESC, lot_id);
CREATE INDEX saved_search_matches_unseen_idx ON saved_search_matches (user_id, matched_at DESC, lot_id) WHERE seen_at IS NULL;
CREATE INDEX saved_search_matches_digest_idx ON saved_search_matches (user_id, matched_at) WHERE emailed_at IS NULL;
CREATE INDEX saved_search_matches_lot_idx ON saved_search_matches (lot_id);

-- Saved-search notices live only in the bell; no email or push is sent for them.
ALTER TABLE notifications DROP CONSTRAINT notifications_channel_allowed;
ALTER TABLE notifications ADD CONSTRAINT notifications_channel_allowed
  CHECK (channel IN ('sms', 'push', 'email', 'in_app'));
