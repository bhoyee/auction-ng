ALTER TABLE lots
  ADD COLUMN auto_relist_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN auto_relist_count integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT lots_auto_relist_count_check CHECK (auto_relist_count >= 0 AND auto_relist_count <= 2);
CREATE INDEX lot_settlements_unsold_review_idx ON lot_settlements(lot_id)
  WHERE status = 'unsold' AND relist_lot_id IS NULL;
