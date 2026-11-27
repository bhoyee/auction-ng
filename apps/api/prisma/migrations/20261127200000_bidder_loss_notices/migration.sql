-- Every losing bidder is emailed once when an item is sold (2026-11-27).
-- Lots closed before this change are marked done so nobody gets an old notice.
ALTER TABLE lots ADD COLUMN losers_notified_at timestamptz(3);
UPDATE lots SET losers_notified_at = now() WHERE status = 'closed';
CREATE INDEX lots_losers_pending_idx ON lots (id) WHERE status = 'closed' AND losers_notified_at IS NULL;
