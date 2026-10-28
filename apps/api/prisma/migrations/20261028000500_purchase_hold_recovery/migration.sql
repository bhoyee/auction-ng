ALTER TABLE purchases ADD COLUMN holds_released_at timestamptz(3);
CREATE INDEX purchases_unfinished_idx ON purchases(namespace,id)
  WHERE status='pending' OR (status='paid' AND holds_released_at IS NULL);
