CREATE TABLE lot_bidder_messages (
 id uuid PRIMARY KEY,
 lot_id uuid NOT NULL REFERENCES lots(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 message_ciphertext bytea NOT NULL,
 cutoff_at timestamptz(3) NOT NULL,
 cursor_user_id uuid,
 recipient_count integer NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
 completed_at timestamptz(3),
 created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX lot_bidder_messages_pending_idx ON lot_bidder_messages(completed_at,created_at,id);
CREATE INDEX bids_lot_user_created_idx ON bids(lot_id,user_id,created_at);
