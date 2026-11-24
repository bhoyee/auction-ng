-- Open staff screens refresh silently when a batch's numbers, status or files
-- change. Recalculating to the same numbers stays quiet.
CREATE FUNCTION capture_batch_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'batch_stats' THEN
    IF TG_OP = 'UPDATE' AND
      (to_jsonb(NEW) - 'updated_at') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'updated_at')
    THEN RETURN NULL; END IF;
    source_id := NEW.batch_id;
  ELSIF TG_TABLE_NAME = 'batch_attachments' THEN
    source_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.batch_id ELSE NEW.batch_id END;
  ELSE
    source_id := NEW.id;
  END IF;
  INSERT INTO staff_activity_events (source_key, kind, entity_id)
    VALUES ('workspace.changed:batch:' || source_id::text || ':' || txid_current()::text, 'workspace.changed', source_id)
    ON CONFLICT (source_key) DO NOTHING;
  RETURN NULL;
END $$;
CREATE TRIGGER staff_batch_stats_event AFTER INSERT OR UPDATE ON batch_stats
  FOR EACH ROW EXECUTE FUNCTION capture_batch_change();
CREATE TRIGGER staff_batch_event AFTER INSERT OR UPDATE ON batches
  FOR EACH ROW EXECUTE FUNCTION capture_batch_change();
CREATE TRIGGER staff_batch_file_event AFTER INSERT OR DELETE ON batch_attachments
  FOR EACH ROW EXECUTE FUNCTION capture_batch_change();
