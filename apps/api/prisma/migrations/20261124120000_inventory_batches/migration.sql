-- T15e inventory batches. A batch is one purchase from one supplier, paid in
-- full (owner decision 2026-11-24): no supplier balances and no ledger rows.

-- Suppliers: a fourth type, bank and address (encrypted), usual categories.
-- Phones move to phone_ciphertext; the recalculation job encrypts old ones.
ALTER TABLE suppliers DROP CONSTRAINT suppliers_type_check;
ALTER TABLE suppliers
  ADD CONSTRAINT suppliers_type_check CHECK (type IN ('marketplace_returns','overseas_pallets','retailer','individual')),
  ADD COLUMN phone_ciphertext bytea,
  ADD COLUMN address_ciphertext bytea,
  ADD COLUMN bank_ciphertext bytea,
  ADD COLUMN usual_category_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN created_by_id uuid REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX suppliers_created_by_idx ON suppliers (created_by_id);

CREATE SEQUENCE batch_code_seq AS bigint START 1;
CREATE FUNCTION next_batch_code() RETURNS varchar LANGUAGE sql VOLATILE AS $$
  SELECT 'B-' || CASE WHEN n < 10000 THEN lpad(n::text, 4, '0') ELSE n::text END
  FROM (SELECT nextval('batch_code_seq') AS n) s
$$;

CREATE TABLE batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(12) NOT NULL DEFAULT next_batch_code(),
  name varchar(80) NOT NULL,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  supplier_ref varchar(80),
  bought_on date NOT NULL,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  status varchar(12) NOT NULL DEFAULT 'arriving' CHECK (status IN ('arriving','received','selling','closed')),
  expected_on date,
  received_on date,
  items_expected integer NOT NULL CHECK (items_expected BETWEEN 1 AND 100000),
  items_received integer CHECK (items_received BETWEEN 1 AND 100000),
  cost_supplier_kobo bigint NOT NULL DEFAULT 0 CHECK (cost_supplier_kobo >= 0),
  cost_transport_kobo bigint NOT NULL DEFAULT 0 CHECK (cost_transport_kobo >= 0),
  cost_customs_kobo bigint NOT NULL DEFAULT 0 CHECK (cost_customs_kobo >= 0),
  cost_other_kobo bigint NOT NULL DEFAULT 0 CHECK (cost_other_kobo >= 0),
  cost_share_method varchar(8) NOT NULL DEFAULT 'retail' CHECK (cost_share_method IN ('retail','equal')),
  paid_from varchar(12) CHECK (paid_from IN ('business','personal')),
  notes varchar(1000),
  -- Off once an admin reopens a batch by hand, so it is not closed again.
  auto_close boolean NOT NULL DEFAULT true,
  closed_at timestamptz(3),
  closed_reason varchar(200),
  created_by_id uuid REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT batches_cost_positive CHECK (
    cost_supplier_kobo + cost_transport_kobo + cost_customs_kobo + cost_other_kobo BETWEEN 1 AND 9007199254740991),
  CONSTRAINT batches_closed_state CHECK ((status = 'closed') = (closed_at IS NOT NULL)),
  CONSTRAINT batches_received_state CHECK (status = 'arriving' OR received_on IS NOT NULL)
);
CREATE UNIQUE INDEX batches_code_key ON batches (code);
CREATE INDEX batches_supplier_idx ON batches (supplier_id, created_at, id);
CREATE INDEX batches_location_idx ON batches (location_id, status, created_at, id);
CREATE INDEX batches_list_idx ON batches (status, created_at, id);
CREATE INDEX batches_created_idx ON batches (created_at, id);
CREATE INDEX batches_created_by_idx ON batches (created_by_id);

CREATE TABLE batch_categories (
  batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  PRIMARY KEY (batch_id, category_id)
);
CREATE INDEX batch_categories_category_idx ON batch_categories (category_id);

-- Supplier invoices and item lists, encrypted and private: never served from
-- the public image store.
CREATE TABLE batch_attachments (
  id uuid PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  name varchar(120) NOT NULL,
  content_type varchar(100) NOT NULL,
  bytes integer NOT NULL CHECK (bytes BETWEEN 1 AND 5242880),
  content_ciphertext bytea NOT NULL,
  created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX batch_attachments_batch_idx ON batch_attachments (batch_id, created_at, id);
CREATE INDEX batch_attachments_created_by_idx ON batch_attachments (created_by_id);

-- Worked out by the recalculation job, never on a page load.
CREATE TABLE batch_stats (
  batch_id uuid PRIMARY KEY REFERENCES batches(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  lots_count integer NOT NULL DEFAULT 0,
  lots_sold integer NOT NULL DEFAULT 0,
  lots_written_off integer NOT NULL DEFAULT 0,
  lots_stuck integer NOT NULL DEFAULT 0,
  money_back_kobo bigint NOT NULL DEFAULT 0 CHECK (money_back_kobo >= 0),
  unsold_cost_kobo bigint NOT NULL DEFAULT 0 CHECK (unsold_cost_kobo >= 0),
  oldest_unsold_at timestamptz(3),
  last_sold_at timestamptz(3),
  break_even_on date,
  updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Lots ----------------------------------------------------------------------
ALTER TABLE lots
  ADD COLUMN batch_id uuid REFERENCES batches(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD COLUMN written_off_at timestamptz(3);
-- Written-off stock stays archived, so it can't be relisted or edited.
ALTER TABLE lots ADD CONSTRAINT lots_written_off_archived
  CHECK (written_off_at IS NULL OR archived_at IS NOT NULL);
CREATE INDEX lots_batch_idx ON lots (batch_id, id) WHERE batch_id IS NOT NULL;

-- Unit costs live outside lots, so recalculating never locks a live lot and
-- no lot response can carry a cost by accident. No foreign key to lots on
-- purpose: checking it would wait for a lot that is being sold.
CREATE TABLE lot_costs (
  lot_id uuid PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  unit_cost_kobo bigint NOT NULL CHECK (unit_cost_kobo >= 0),
  -- The item's state and when it was first added, for stock at cost by age.
  item_state varchar(12) NOT NULL DEFAULT 'unsold' CHECK (item_state IN ('unsold','sold','written_off','relisted')),
  item_since timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX lot_costs_batch_idx ON lot_costs (batch_id, lot_id);
CREATE INDEX lot_costs_unsold_idx ON lot_costs (item_since) WHERE item_state = 'unsold';

-- Append-only so a sale never waits for another: the job reads, recalculates
-- and removes what it read.
CREATE TABLE batch_recalc_queue (
  id bigserial PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX batch_recalc_queue_batch_idx ON batch_recalc_queue (batch_id, id);

CREATE FUNCTION queue_batch_recalc_for_lot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.batch_id IS NOT NULL THEN
      INSERT INTO batch_recalc_queue (batch_id) VALUES (OLD.batch_id);
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.batch_id IS NOT NULL THEN
      INSERT INTO batch_recalc_queue (batch_id) VALUES (NEW.batch_id);
    END IF;
  ELSIF (NEW.batch_id, NEW.retail_price_kobo, NEW.status, NEW.written_off_at, NEW.deleted_at)
      IS DISTINCT FROM (OLD.batch_id, OLD.retail_price_kobo, OLD.status, OLD.written_off_at, OLD.deleted_at) THEN
    IF NEW.batch_id IS NOT NULL THEN
      INSERT INTO batch_recalc_queue (batch_id) VALUES (NEW.batch_id);
    END IF;
    IF OLD.batch_id IS NOT NULL AND OLD.batch_id IS DISTINCT FROM NEW.batch_id THEN
      INSERT INTO batch_recalc_queue (batch_id) VALUES (OLD.batch_id);
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER lots_batch_recalc AFTER INSERT OR UPDATE OR DELETE ON lots
  FOR EACH ROW EXECUTE FUNCTION queue_batch_recalc_for_lot();

CREATE FUNCTION queue_batch_recalc_for_lot_id() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO batch_recalc_queue (batch_id)
    SELECT l.batch_id FROM lots l WHERE l.id = NEW.lot_id AND l.batch_id IS NOT NULL;
  RETURN NULL;
END $$;
CREATE TRIGGER invoice_lines_batch_recalc AFTER INSERT ON invoice_lines
  FOR EACH ROW EXECUTE FUNCTION queue_batch_recalc_for_lot_id();
CREATE TRIGGER lot_settlements_batch_recalc AFTER INSERT OR UPDATE ON lot_settlements
  FOR EACH ROW EXECUTE FUNCTION queue_batch_recalc_for_lot_id();
CREATE TRIGGER unsold_relists_batch_recalc AFTER INSERT ON unsold_relists
  FOR EACH ROW EXECUTE FUNCTION queue_batch_recalc_for_lot_id();

CREATE FUNCTION queue_batch_recalc_for_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO batch_recalc_queue (batch_id)
      SELECT DISTINCT l.batch_id FROM invoice_lines i JOIN lots l ON l.id = i.lot_id
      WHERE i.invoice_id = NEW.id AND l.batch_id IS NOT NULL;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER invoices_batch_recalc AFTER UPDATE OF status ON invoices
  FOR EACH ROW EXECUTE FUNCTION queue_batch_recalc_for_invoice();

-- Permissions. Admins change what each role can do in Staff and roles.
ALTER TABLE staff_roles DROP CONSTRAINT staff_role_permissions;
ALTER TABLE staff_roles ADD CONSTRAINT staff_role_permissions CHECK(permissions <@ ARRAY['dashboard.view','inventory.read','inventory.write','auctions.manage','pickup.manage','buyers.read','buyers.manage','support.manage','finance.read','refunds.manage','withdrawals.manage','wallet.manage','fees.manage','bids.cancel','audit.read','records.archive','staff.manage','records.purge','setup.manage','setup.read','bids.read','storage.manage','storage.adjust','lots.relist','lots.delete','batches.read','batches.receive','batches.manage','batches.costs','suppliers.read','suppliers.bank','lots.cost']::text[] AND revision>0);
UPDATE staff_roles SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['batches.read','batches.receive','batches.manage','batches.costs','suppliers.read']))
  WHERE built_in AND key = 'manager';
UPDATE staff_roles SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['batches.read','batches.receive']))
  WHERE built_in AND key IN ('intake','warehouse');
UPDATE staff_roles SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['batches.read','batches.costs','suppliers.read','suppliers.bank','lots.cost']))
  WHERE built_in AND key = 'finance';
