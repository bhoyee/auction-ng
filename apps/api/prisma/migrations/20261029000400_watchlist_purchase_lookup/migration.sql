-- Bound purchase-outcome lookups for saved-lot activity without scanning purchases.
CREATE INDEX "purchases_lot_status_idx" ON "purchases"("lot_id", "status");
