-- A request always starts unapproved, and what managers approve is what is paid.
CREATE FUNCTION guard_refund_request_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'refund_requests' THEN
    IF NEW.status <> 'requested' OR NEW.first_approved_by_id IS NOT NULL
    THEN RAISE EXCEPTION 'a refund request starts unapproved'; END IF;
  ELSIF EXISTS (SELECT 1 FROM refund_requests r WHERE r.id = NEW.request_id
    AND (r.status <> 'requested' OR r.first_approved_by_id IS NOT NULL))
  THEN RAISE EXCEPTION 'an approved refund request can not change'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER refund_requests_start BEFORE INSERT ON refund_requests
  FOR EACH ROW EXECUTE FUNCTION guard_refund_request_insert();
CREATE TRIGGER refund_request_lines_start BEFORE INSERT ON refund_request_lines
  FOR EACH ROW EXECUTE FUNCTION guard_refund_request_insert();
