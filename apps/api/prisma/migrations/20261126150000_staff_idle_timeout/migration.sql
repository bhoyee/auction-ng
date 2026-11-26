-- Existing sessions receive fifteen minutes from rollout, capped by their
-- unchanged original expiry. Buyers do not use this activity timestamp.
ALTER TABLE auth_sessions
  ADD COLUMN staff_last_active_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
