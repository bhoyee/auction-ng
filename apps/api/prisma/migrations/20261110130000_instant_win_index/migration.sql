-- Instant Win listing: open lots offering Buy Now, ordered by closing time.
CREATE INDEX "lots_instant_win_end_at_id_idx" ON "lots"("status", "end_at", "id")
  WHERE "fixed_price_kobo" IS NOT NULL;
