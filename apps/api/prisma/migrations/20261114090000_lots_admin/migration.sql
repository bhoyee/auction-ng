-- Lots inventory (T15e, owner decisions 2026-11-13): who added a lot, its
-- supplier, a draft's chosen run time, included items and defects, defect
-- photos, soft delete with a reason, saved list views, and list indexes.
ALTER TABLE lots
  ADD COLUMN created_by_id UUID REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD COLUMN supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD COLUMN run_time_minutes INTEGER CHECK (run_time_minutes BETWEEN 60 AND 10080),
  ADD COLUMN included TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN defects TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN deleted_at TIMESTAMPTZ(3),
  ADD COLUMN delete_reason VARCHAR(200),
  ADD COLUMN deleted_by_id UUID REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT lots_included_limit CHECK (cardinality(included) <= 20),
  ADD CONSTRAINT lots_defects_limit CHECK (cardinality(defects) <= 20),
  -- Only drafts and cancelled (formerly scheduled) lots can be deleted, and a
  -- deleted lot always records who deleted it and why.
  ADD CONSTRAINT lots_deleted_inactive CHECK (
    deleted_at IS NULL
    OR (status IN ('draft', 'cancelled') AND delete_reason IS NOT NULL AND deleted_by_id IS NOT NULL)
  );

-- Who added each existing lot, from the audit log that every create writes.
UPDATE lots l SET created_by_id = a.actor_id
FROM (
  SELECT DISTINCT ON (entity_id) entity_id, actor_id
  FROM audit_log
  WHERE action = 'lots.created' AND entity_type = 'lot' AND actor_id IS NOT NULL
  ORDER BY entity_id, created_at
) a
WHERE a.entity_id = l.id::text AND l.created_by_id IS NULL;

ALTER TABLE lot_images ADD COLUMN is_defect BOOLEAN NOT NULL DEFAULT FALSE;

-- A staff member's own saved tabs on the Lots page (filters, sort, tab).
CREATE TABLE staff_lot_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  name VARCHAR(40) NOT NULL,
  query JSONB NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, name)
);
CREATE INDEX staff_lot_views_user_idx ON staff_lot_views (user_id, sort_order, id);

-- Lots list: contains-search on title and lot ID, and the filters and sorts
-- every tab uses, without deleted lots.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX lots_title_trgm_idx ON lots USING gin (title gin_trgm_ops);
CREATE INDEX lots_number_trgm_idx ON lots USING gin (lot_number gin_trgm_ops);
CREATE INDEX lots_admin_created_idx ON lots (created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX lots_admin_status_end_idx ON lots (status, end_at, id) WHERE deleted_at IS NULL AND archived_at IS NULL;
CREATE INDEX lots_supplier_idx ON lots (supplier_id, id) WHERE supplier_id IS NOT NULL;
CREATE INDEX lots_created_by_idx ON lots (created_by_id, created_at DESC) WHERE created_by_id IS NOT NULL;
CREATE INDEX lots_deleted_idx ON lots (deleted_at DESC, id DESC) WHERE deleted_at IS NOT NULL;

-- Delete lots: admins always; built-in managers by default.
ALTER TABLE staff_roles DROP CONSTRAINT staff_role_permissions;
ALTER TABLE staff_roles ADD CONSTRAINT staff_role_permissions CHECK(permissions <@ ARRAY['dashboard.view','inventory.read','inventory.write','auctions.manage','pickup.manage','buyers.read','buyers.manage','support.manage','finance.read','refunds.manage','withdrawals.manage','wallet.manage','fees.manage','bids.cancel','audit.read','records.archive','staff.manage','records.purge','setup.manage','setup.read','bids.read','storage.manage','storage.adjust','lots.relist','lots.delete']::text[] AND revision>0);
UPDATE staff_roles SET permissions = array_append(permissions, 'lots.delete')
  WHERE built_in AND key = 'manager' AND NOT ('lots.delete' = ANY (permissions));

