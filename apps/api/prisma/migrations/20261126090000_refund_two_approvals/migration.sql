-- A refund needs two approvals: a manager first, then an admin. The person
-- who asked is never one of them. NOT VALID leaves earlier decisions alone.
ALTER TABLE refund_requests
  ADD COLUMN first_approved_by_id uuid REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD COLUMN first_approved_at timestamptz(3),
  ADD COLUMN first_note_ciphertext bytea,
  ADD CONSTRAINT refund_requests_first_pair CHECK ((first_approved_by_id IS NULL) = (first_approved_at IS NULL)),
  ADD CONSTRAINT refund_requests_first_other CHECK (
    first_approved_by_id IS NULL OR (first_approved_by_id <> requested_by_id
      AND (decided_by_id IS NULL OR decided_by_id <> first_approved_by_id))),
  ADD CONSTRAINT refund_requests_both_approved CHECK (
    status <> 'approved' OR first_approved_by_id IS NOT NULL) NOT VALID;
CREATE INDEX refund_requests_first_approved_by_idx ON refund_requests (first_approved_by_id);
CREATE OR REPLACE FUNCTION protect_refund_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.status <> 'requested'
    OR (NEW.id, NEW.invoice_id, NEW.requested_by_id, NEW.reason, NEW.amount_kobo, NEW.created_at)
      IS DISTINCT FROM (OLD.id, OLD.invoice_id, OLD.requested_by_id, OLD.reason, OLD.amount_kobo, OLD.created_at)
    OR (OLD.first_approved_by_id IS NOT NULL
      AND (NEW.first_approved_by_id, NEW.first_approved_at) IS DISTINCT FROM (OLD.first_approved_by_id, OLD.first_approved_at))
    OR (NEW.status = 'approved' AND OLD.first_approved_by_id IS NULL)
  THEN RAISE EXCEPTION 'refund request history is immutable'; END IF;
  RETURN NEW;
END $$;

-- The first approval is the manager's by default; admins can give it to others.
UPDATE staff_roles SET permissions = array_remove(permissions, 'refunds.manage')
  WHERE built_in AND key = 'finance';

-- Storage stops when an invoice is fully refunded (owner decision 2026-11-24).
UPDATE pickup_storage_cases c SET waived = true, revision = c.revision + 1,
  terms_revision = c.terms_revision + 1, updated_at = CURRENT_TIMESTAMP
  FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id
  WHERE l.id = c.invoice_line_id AND i.status = 'refunded'
    AND c.collected_at IS NULL AND NOT c.waived;
