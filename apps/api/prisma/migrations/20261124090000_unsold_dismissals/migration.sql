-- Deleting an item from Unsold review (owner decision 2026-11-24) only takes
-- it off that list: the lot, its auction result and its price never change.
-- Restoring removes the row. After 30 days the row is permanent.
CREATE TABLE unsold_dismissals (
  lot_id UUID PRIMARY KEY REFERENCES lots(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  dismissed_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX unsold_dismissals_recent_idx
  ON unsold_dismissals (dismissed_at DESC, lot_id DESC);
CREATE INDEX unsold_dismissals_actor_idx ON unsold_dismissals (actor_id);

CREATE FUNCTION protect_unsold_dismissal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR OLD.dismissed_at <= CURRENT_TIMESTAMP - INTERVAL '30 days' THEN
    RAISE EXCEPTION 'unsold dismissal is permanent';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER unsold_dismissals_protected BEFORE UPDATE OR DELETE ON unsold_dismissals
  FOR EACH ROW EXECUTE FUNCTION protect_unsold_dismissal();

-- Other staff screens refresh their list and count.
CREATE FUNCTION capture_unsold_dismissal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_id UUID;
BEGIN
  source_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.lot_id ELSE NEW.lot_id END;
  INSERT INTO staff_activity_events (source_key, kind, entity_id)
    VALUES ('workspace.changed:' || source_id::text || ':' || txid_current()::text, 'workspace.changed', source_id)
    ON CONFLICT (source_key) DO NOTHING;
  RETURN NULL;
END $$;
CREATE TRIGGER staff_unsold_dismissal_event AFTER INSERT OR DELETE ON unsold_dismissals
  FOR EACH ROW EXECUTE FUNCTION capture_unsold_dismissal();
