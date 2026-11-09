CREATE INDEX fulfilments_location_pickup_counts_idx ON fulfilments(location_id,type,status,collected_at,invoice_id);

-- Count queries reuse lots(location_id,...) and the unique lot/invoice-line,
-- collection-item and settlement keys. Only content-free refresh events are added.
CREATE FUNCTION capture_staff_centre_counts() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_data jsonb; source_id uuid;
BEGIN
  row_data:=to_jsonb(NEW);
  source_id:=COALESCE(row_data->>'id',row_data->>'invoice_line_id')::uuid;
  INSERT INTO staff_activity_events(source_key,kind,entity_id)
  VALUES('centre:'||TG_TABLE_NAME||':'||source_id::text||':'||txid_current()::text,'workspace.changed',source_id)
  ON CONFLICT(source_key) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER staff_centre_fulfilment_event AFTER INSERT OR UPDATE OF location_id,type,status,collected_at ON fulfilments FOR EACH ROW EXECUTE FUNCTION capture_staff_centre_counts();
CREATE TRIGGER staff_centre_collection_event AFTER INSERT ON pickup_collection_items FOR EACH ROW EXECUTE FUNCTION capture_staff_centre_counts();
CREATE TRIGGER staff_centre_stock_move_event AFTER UPDATE OF location_id ON lots FOR EACH ROW EXECUTE FUNCTION capture_staff_centre_counts();
