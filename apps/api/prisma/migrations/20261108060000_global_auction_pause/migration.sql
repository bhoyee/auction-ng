CREATE TABLE auction_pause_commands (
 id uuid PRIMARY KEY,
 namespace varchar(160) NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 operation varchar(16) NOT NULL CHECK(operation IN ('pause_all','resume_all')),
 status varchar(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','applying','completed')),
 paused_at bigint,
 resumed_at bigint,
 cursor_lot_id uuid,
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 completed_at timestamptz(3)
);
CREATE UNIQUE INDEX auction_pause_one_pending_idx ON auction_pause_commands(namespace) WHERE status<>'completed';
CREATE INDEX auction_pause_namespace_created_idx ON auction_pause_commands(namespace,created_at,id);
CREATE TABLE auction_resume_lots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 command_id uuid NOT NULL REFERENCES auction_pause_commands(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 lot_id uuid NOT NULL REFERENCES lots(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 old_end_at bigint NOT NULL CHECK(old_end_at>=0),
 new_end_at bigint NOT NULL CHECK(new_end_at>=old_end_at AND new_end_at<=9007199254740991),
 new_start_at bigint,
 schedule_changed boolean NOT NULL DEFAULT false,
 completed_at timestamptz(3),
 applied boolean,
 UNIQUE(command_id,lot_id)
);
CREATE INDEX auction_resume_lots_lot_idx ON auction_resume_lots(lot_id,completed_at,id);
