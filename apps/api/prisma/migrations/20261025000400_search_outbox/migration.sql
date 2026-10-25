CREATE SEQUENCE "search_index_revision_seq" AS BIGINT;
CREATE TABLE "search_index_jobs" (
  "lot_id" UUID PRIMARY KEY REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "version" BIGINT NOT NULL DEFAULT nextval('search_index_revision_seq'::regclass),
  "applied_version" BIGINT NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "search_index_jobs_version_check" CHECK (version > 0 AND applied_version >= 0 AND applied_version <= version)
);
CREATE INDEX "search_index_jobs_pending_idx" ON "search_index_jobs"("version") WHERE "version" > "applied_version";
CREATE FUNCTION enqueue_lot_search_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO search_index_jobs (lot_id) VALUES (NEW.id)
  ON CONFLICT (lot_id) DO UPDATE SET version=nextval('search_index_revision_seq'::regclass), updated_at=clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER lots_enqueue_search_change AFTER INSERT OR UPDATE ON lots FOR EACH ROW EXECUTE FUNCTION enqueue_lot_search_change();
-- Backfill durable jobs for pre-existing lots without changing their visibility.
INSERT INTO search_index_jobs (lot_id) SELECT id FROM lots;
