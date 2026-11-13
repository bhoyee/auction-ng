-- Unsold review (owner decisions 2026-11-13): admin-set relist rules, a
-- "lots.relist" staff permission and an index for the unsold list and count.
CREATE TABLE relist_settings (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  max_retries SMALLINT NOT NULL DEFAULT 2 CHECK (max_retries BETWEEN 0 AND 5),
  run_hours SMALLINT NOT NULL DEFAULT 24 CHECK (run_hours BETWEEN 1 AND 168),
  price_cut_percent SMALLINT NOT NULL DEFAULT 0 CHECK (price_cut_percent BETWEEN 0 AND 50),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0 AND revision < 2147483647),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO relist_settings (id) VALUES (1);

ALTER TABLE staff_roles DROP CONSTRAINT staff_role_permissions;
ALTER TABLE staff_roles ADD CONSTRAINT staff_role_permissions CHECK(permissions <@ ARRAY['dashboard.view','inventory.read','inventory.write','auctions.manage','pickup.manage','buyers.read','buyers.manage','support.manage','finance.read','refunds.manage','withdrawals.manage','wallet.manage','fees.manage','bids.cancel','audit.read','records.archive','staff.manage','records.purge','setup.manage','setup.read','bids.read','storage.manage','storage.adjust','lots.relist']::text[] AND revision>0);
UPDATE staff_roles SET permissions = array_append(permissions, 'lots.relist')
  WHERE built_in AND key = 'manager' AND NOT ('lots.relist' = ANY (permissions));

-- Admins may allow up to 5 automatic relists (was fixed at 2).
ALTER TABLE lots DROP CONSTRAINT lots_auto_relist_count_check;
ALTER TABLE lots ADD CONSTRAINT lots_auto_relist_count_check
  CHECK (auto_relist_count >= 0 AND auto_relist_count <= 5);

-- Manual relists from Unsold review. Kept apart from lot_settlements, whose
-- finished results are immutable: one row links an unsold lot to its relist.
CREATE TABLE unsold_relists (
  lot_id UUID PRIMARY KEY REFERENCES lots(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  relist_lot_id UUID NOT NULL UNIQUE REFERENCES lots(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (lot_id <> relist_lot_id)
);
CREATE FUNCTION protect_unsold_relist() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'relist history is immutable';
END $$;
CREATE TRIGGER unsold_relists_immutable BEFORE UPDATE OR DELETE ON unsold_relists
  FOR EACH ROW EXECUTE FUNCTION protect_unsold_relist();

-- Unsold items still waiting for a relist decision, newest first.
CREATE INDEX lot_settlements_unsold_queue_idx
  ON lot_settlements (namespace, closed_at DESC, lot_id DESC)
  WHERE status = 'unsold' AND relist_lot_id IS NULL;
