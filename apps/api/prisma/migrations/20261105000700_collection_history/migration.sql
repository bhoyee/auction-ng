CREATE INDEX "pickup_receipts_history_idx" ON "pickup_collection_receipts"("created_at","id");
CREATE INDEX "fulfilments_collection_history_idx" ON "fulfilments"("type","status","collected_at","invoice_id");
