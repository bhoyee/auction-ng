ALTER TABLE categories ADD COLUMN archived_at timestamptz(3), ADD COLUMN created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE locations ADD COLUMN archived_at timestamptz(3), ADD COLUMN updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN staff_preferences jsonb NOT NULL DEFAULT '{}';
CREATE INDEX categories_archive_id_idx ON categories(archived_at,id);
CREATE INDEX locations_archive_id_idx ON locations(archived_at,id);
CREATE INDEX audit_log_created_id_idx ON audit_log(created_at,id);
ALTER TABLE staff_roles DROP CONSTRAINT staff_role_permissions;
ALTER TABLE staff_roles ADD CONSTRAINT staff_role_permissions CHECK(permissions <@ ARRAY['dashboard.view','inventory.read','inventory.write','auctions.manage','pickup.manage','buyers.read','buyers.manage','support.manage','finance.read','refunds.manage','withdrawals.manage','wallet.manage','fees.manage','bids.cancel','audit.read','records.archive','staff.manage','records.purge','setup.manage']::text[] AND revision>0);
UPDATE staff_roles SET permissions=array_append(permissions,'setup.manage') WHERE key='admin' AND NOT 'setup.manage'=ANY(permissions);
-- Retain all existing setup IDs, foreign keys and unique slug/code constraints.
