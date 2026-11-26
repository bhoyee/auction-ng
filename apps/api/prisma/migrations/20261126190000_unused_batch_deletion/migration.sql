ALTER TABLE batches
  ADD COLUMN deleted_at timestamptz(3),
  ADD COLUMN delete_reason varchar(200),
  ADD COLUMN deleted_by_id uuid REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD COLUMN stock_linked_at timestamptz(3);

UPDATE batches b SET stock_linked_at = b.created_at
WHERE b.received_on IS NOT NULL OR b.items_received IS NOT NULL OR b.status <> 'arriving'
  OR EXISTS (SELECT 1 FROM lots l WHERE l.batch_id = b.id)
  OR EXISTS (SELECT 1 FROM lot_costs c WHERE c.batch_id = b.id)
  OR EXISTS (SELECT 1 FROM batch_stats s WHERE s.batch_id = b.id AND s.lots_count > 0);

CREATE INDEX batches_deleted_list_idx ON batches(deleted_at,status,created_at,id);
CREATE INDEX batches_cleanup_idx ON batches(deleted_at,id) WHERE deleted_at IS NOT NULL;
CREATE INDEX batches_supplier_active_idx ON batches(supplier_id,created_at,id) WHERE deleted_at IS NULL;
ALTER TABLE batches ADD CONSTRAINT batches_deletion_state CHECK (
  (deleted_at IS NULL AND deleted_by_id IS NULL AND delete_reason IS NULL)
  OR (deleted_at IS NOT NULL AND deleted_by_id IS NOT NULL AND length(trim(delete_reason)) >= 3
    AND status = 'arriving' AND received_on IS NULL AND items_received IS NULL AND stock_linked_at IS NULL)
);

-- Linking stock and deletion contend on the same batch row. Once a batch has
-- contained a lot, moving/archiving/deleting that lot never makes it unused.
CREATE FUNCTION protect_batch_stock_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE linked_at timestamptz;
BEGIN
  IF NEW.batch_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.batch_id IS DISTINCT FROM OLD.batch_id) THEN
    SELECT stock_linked_at INTO linked_at FROM batches
      WHERE id = NEW.batch_id AND deleted_at IS NULL FOR NO KEY UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Deleted or missing batch cannot receive lots'; END IF;
    IF linked_at IS NULL THEN
      UPDATE batches SET stock_linked_at = CURRENT_TIMESTAMP WHERE id = NEW.batch_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lots_batch_stock_guard BEFORE INSERT OR UPDATE OF batch_id ON lots
FOR EACH ROW EXECUTE FUNCTION protect_batch_stock_link();

CREATE FUNCTION protect_unused_batch_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('giddydeal.batch_purge',true) IS DISTINCT FROM 'on'
      OR OLD.deleted_at IS NULL OR OLD.deleted_at > CURRENT_TIMESTAMP - interval '30 days'
      OR OLD.status <> 'arriving' OR OLD.received_on IS NOT NULL OR OLD.items_received IS NOT NULL
      OR OLD.stock_linked_at IS NOT NULL
      OR EXISTS (SELECT 1 FROM lots WHERE batch_id=OLD.id)
      OR EXISTS (SELECT 1 FROM lot_costs WHERE batch_id=OLD.id) THEN
      RAISE EXCEPTION 'Only expired deleted unused batches may be removed';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.stock_linked_at IS NOT NULL AND NEW.stock_linked_at IS DISTINCT FROM OLD.stock_linked_at THEN
    RAISE EXCEPTION 'Batch stock history is immutable';
  END IF;
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
    AND OLD.deleted_at <= CURRENT_TIMESTAMP - interval '30 days' THEN
    RAISE EXCEPTION 'Batch restore period has expired';
  END IF;
  IF NEW.deleted_at IS NOT NULL AND (
    EXISTS (SELECT 1 FROM lots WHERE batch_id=NEW.id)
    OR EXISTS (SELECT 1 FROM lot_costs WHERE batch_id=NEW.id)) THEN
    RAISE EXCEPTION 'A batch with stock cannot be deleted';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER batches_deletion_guard BEFORE UPDATE OR DELETE ON batches
FOR EACH ROW EXECUTE FUNCTION protect_unused_batch_deletion();
