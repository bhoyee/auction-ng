-- "Coming soon, date to be announced" (owner decision 2026-11-14): a finished
-- draft shown in Upcoming for viewing and watching only. It is never
-- scheduled, so pre-bids, bids and Buy Now still refuse it.
ALTER TABLE "lots" ADD COLUMN "coming_soon_at" TIMESTAMPTZ(3);

CREATE INDEX "lots_coming_soon_idx" ON "lots" ("coming_soon_at", "id")
  WHERE "status" = 'draft'
    AND "coming_soon_at" IS NOT NULL
    AND "deleted_at" IS NULL
    AND "archived_at" IS NULL;
