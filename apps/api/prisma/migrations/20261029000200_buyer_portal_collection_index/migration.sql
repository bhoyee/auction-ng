CREATE INDEX "invoices_buyer_status_history_idx" ON "invoices" ("user_id", "status", "created_at", "id");
