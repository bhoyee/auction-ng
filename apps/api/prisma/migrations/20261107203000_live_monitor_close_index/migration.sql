-- The Live monitor worker reads confirmed outcomes since midnight WAT.
CREATE INDEX lot_settlements_monitor_closed_idx ON lot_settlements(namespace, closed_at DESC, lot_id DESC);

-- Legacy deadlines may already include extensions: never invent their original duration.
ALTER TABLE lots ADD COLUMN original_run_time_ms bigint;
ALTER TABLE lots ADD CONSTRAINT lots_original_run_time_valid CHECK (original_run_time_ms IS NULL OR original_run_time_ms BETWEEN 1 AND 9007199254740991);
CREATE FUNCTION preserve_original_lot_run_time() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.original_run_time_ms IS NOT NULL AND NEW.original_run_time_ms IS DISTINCT FROM OLD.original_run_time_ms THEN
      RAISE EXCEPTION 'Published lot run time is immutable';
    END IF;
    IF OLD.status IN ('draft','ready') AND NEW.status IN ('scheduled','open') AND OLD.original_run_time_ms IS NULL THEN
      NEW.original_run_time_ms := floor(extract(epoch FROM (NEW.end_at - NEW.start_at)) * 1000)::bigint;
    END IF;
  ELSIF NEW.status IN ('scheduled','open') THEN
    NEW.original_run_time_ms := floor(extract(epoch FROM (NEW.end_at - NEW.start_at)) * 1000)::bigint;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER lots_preserve_original_run_time BEFORE INSERT OR UPDATE ON lots FOR EACH ROW EXECUTE FUNCTION preserve_original_lot_run_time();
