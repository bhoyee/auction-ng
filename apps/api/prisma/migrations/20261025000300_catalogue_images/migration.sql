ALTER TABLE "lot_images"
  ADD COLUMN "thumbnail_url" TEXT,
  ADD COLUMN "width" INTEGER,
  ADD COLUMN "height" INTEGER,
  ADD COLUMN "thumbnail_bytes" INTEGER,
  ADD CONSTRAINT "lot_images_derivatives_check" CHECK (
    (thumbnail_url IS NULL AND width IS NULL AND height IS NULL AND thumbnail_bytes IS NULL)
    OR (thumbnail_url IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL AND thumbnail_bytes IS NOT NULL
      AND thumbnail_url LIKE 'https://%' AND url LIKE 'https://%'
      AND width BETWEEN 1 AND 960 AND height BETWEEN 1 AND 960 AND thumbnail_bytes BETWEEN 1 AND 30000)
  );
CREATE INDEX "lots_status_start_price_kobo_end_at_id_idx" ON "lots"("status", "start_price_kobo", "end_at", "id");
CREATE TABLE "image_uploads" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "lot_id" UUID NOT NULL REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "actor_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "request_key" VARCHAR(80) NOT NULL,
  "object_key" VARCHAR(200) NOT NULL,
  "content_type" VARCHAR(24) NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "image_uploads_metadata_check" CHECK (
    content_type IN ('image/jpeg','image/png','image/webp') AND size_bytes BETWEEN 1 AND 8388608
    AND sha256 ~ '^[a-f0-9]{64}$' AND sort_order BETWEEN 0 AND 19
    AND status IN ('pending','ready') AND expires_at > created_at
  )
);
CREATE UNIQUE INDEX "image_uploads_request_key_key" ON "image_uploads"("request_key");
CREATE UNIQUE INDEX "image_uploads_object_key_key" ON "image_uploads"("object_key");
CREATE INDEX "image_uploads_lot_id_status_expires_at_idx" ON "image_uploads"("lot_id", "status", "expires_at");
