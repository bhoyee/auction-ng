CREATE INDEX "lots_staff_review_idx" ON "lots"("created_at","id");
CREATE INDEX "pre_bids_staff_review_idx" ON "pre_bids"("lot_id","created_at","id");
ALTER TABLE staff_roles DROP CONSTRAINT staff_role_permissions;
ALTER TABLE staff_roles ADD CONSTRAINT staff_role_permissions CHECK(permissions <@ ARRAY['dashboard.view','inventory.read','inventory.write','auctions.manage','pickup.manage','buyers.read','buyers.manage','support.manage','finance.read','refunds.manage','withdrawals.manage','wallet.manage','fees.manage','bids.cancel','audit.read','records.archive','staff.manage','records.purge','setup.manage','bids.read']::text[] AND revision>0);
UPDATE staff_roles SET permissions=array_append(permissions,'bids.read') WHERE key='admin' AND NOT 'bids.read'=ANY(permissions);
