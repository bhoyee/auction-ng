BEGIN;
ALTER TABLE watchlist ADD COLUMN result_handled_at TIMESTAMPTZ(3);
-- Existing closed-item history is retained without sending historical loss mail.
UPDATE watchlist w SET result_handled_at = CURRENT_TIMESTAMP
FROM lots l WHERE l.id = w.lot_id AND l.status = 'closed';
CREATE INDEX watchlist_pending_result_idx ON watchlist(lot_id, user_id)
WHERE result_handled_at IS NULL;
COMMIT;
