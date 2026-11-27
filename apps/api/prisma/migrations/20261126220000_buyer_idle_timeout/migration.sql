-- One rollout grace period, capped by each session's unchanged absolute expiry.
-- Routine polling and token rotation must never advance this timestamp.
ALTER TABLE auth_sessions
  ADD COLUMN buyer_last_active_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
