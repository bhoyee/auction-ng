-- Lot setup deletes move items to "Deleted items" so they can be restored.
-- Categories and locations use archived_at, bins deleted_at (existing);
-- suppliers and brands gain deleted_at.
ALTER TABLE "suppliers" ADD COLUMN "deleted_at" TIMESTAMPTZ(3);
ALTER TABLE "brands" ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

-- Deleted items lists newest first across all five; keep each scan small.
CREATE INDEX "categories_deleted_idx" ON "categories"("archived_at", "id") WHERE "archived_at" IS NOT NULL;
CREATE INDEX "locations_deleted_idx" ON "locations"("archived_at", "id") WHERE "archived_at" IS NOT NULL;
CREATE INDEX "bins_deleted_idx" ON "bins"("deleted_at", "id") WHERE "deleted_at" IS NOT NULL;
CREATE INDEX "suppliers_deleted_idx" ON "suppliers"("deleted_at", "id") WHERE "deleted_at" IS NOT NULL;
CREATE INDEX "brands_deleted_idx" ON "brands"("deleted_at", "id") WHERE "deleted_at" IS NOT NULL;
