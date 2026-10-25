-- Existing reservations were explicitly made under the proxy-only contract.
-- New API preparations always supply the selected mode (default direct).
ALTER TABLE bid_funding_intents
  ADD COLUMN bid_mode varchar(16) NOT NULL DEFAULT 'automatic',
  ADD CONSTRAINT bid_funding_mode_allowed CHECK (bid_mode IN ('direct', 'automatic'));
-- The existing immutable-contract trigger covers this column automatically.
