ALTER TABLE lots ADD COLUMN paused_at timestamptz(3);
CREATE INDEX lots_paused_live_idx ON lots(status,paused_at,end_at,id) WHERE paused_at IS NOT NULL;
CREATE TABLE lot_control_commands (
 id uuid PRIMARY KEY,
 namespace varchar(160) NOT NULL,
 lot_id uuid NOT NULL REFERENCES lots(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 operation varchar(16) NOT NULL CHECK(operation IN ('pause','resume','extend','cancel')),
 status varchar(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','committed','completed','failed')),
 request_ciphertext bytea NOT NULL,
 snapshot_ciphertext bytea,
 old_end_at bigint,
 new_end_at bigint,
 effective_at timestamptz(3),
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 completed_at timestamptz(3)
);
CREATE UNIQUE INDEX lot_control_pending_idx ON lot_control_commands(namespace,lot_id) WHERE status IN ('pending','committed');
CREATE INDEX lot_control_work_idx ON lot_control_commands(namespace,status,created_at,id);
CREATE INDEX lot_control_history_idx ON lot_control_commands(namespace,lot_id,effective_at,id);
