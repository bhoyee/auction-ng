-- Lot setup deletion history filters the audit log by action, newest first.
CREATE INDEX "audit_log_action_created_at_id_idx" ON "audit_log"("action", "created_at", "id");
