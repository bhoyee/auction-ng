CREATE TABLE native_push_devices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 session_id uuid NOT NULL,
 token_hash varchar(64) NOT NULL UNIQUE,
 token_ciphertext bytea NOT NULL,
 platform varchar(8) NOT NULL CHECK (platform IN ('android','ios')),
 enabled boolean NOT NULL DEFAULT true,
 enabled_at timestamptz(3) NOT NULL DEFAULT now(),
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 updated_at timestamptz(3) NOT NULL DEFAULT now(),
 FOREIGN KEY (session_id,user_id) REFERENCES auth_sessions(id,user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CHECK (length(token_hash)=64 AND octet_length(token_ciphertext)>28)
);
CREATE INDEX native_push_active_idx ON native_push_devices(enabled,created_at,id);
CREATE INDEX native_push_owner_idx ON native_push_devices(user_id,enabled,id);
CREATE INDEX native_push_session_idx ON native_push_devices(session_id,enabled,id);
CREATE TABLE native_push_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 device_id uuid NOT NULL REFERENCES native_push_devices(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 status varchar(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','unknown','skipped')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 ticket_id varchar(100),
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 updated_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(notification_id,device_id)
);
CREATE INDEX native_push_delivery_pending_idx ON native_push_deliveries(status,created_at,id);
