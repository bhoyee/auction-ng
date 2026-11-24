-- Invoices module (T15f): partial refunds with request and approval, notes,
-- disputes, company details. Existing amounts never change.

ALTER TABLE invoices
  ADD COLUMN paid_at timestamptz(3),
  ADD COLUMN refunded_kobo bigint NOT NULL DEFAULT 0;
ALTER TABLE invoice_lines
  ADD COLUMN refunded_kobo bigint NOT NULL DEFAULT 0,
  ADD COLUMN refunded_hammer_kobo bigint NOT NULL DEFAULT 0,
  ADD COLUMN refunded_premium_kobo bigint NOT NULL DEFAULT 0;

-- Paid when the pickup record was created; fully refunded invoices as they are.
UPDATE invoices i SET paid_at = COALESCE(
  (SELECT f.created_at FROM fulfilments f WHERE f.invoice_id = i.id), i.created_at)
  WHERE i.status IN ('paid','refunded');
UPDATE invoices SET refunded_kobo = total_kobo WHERE status = 'refunded';
UPDATE invoice_lines l SET refunded_kobo = l.total_kobo,
  refunded_hammer_kobo = l.hammer_kobo, refunded_premium_kobo = l.premium_kobo
  FROM invoices i WHERE i.id = l.invoice_id AND i.status = 'refunded';

ALTER TABLE invoices
  ADD CONSTRAINT invoices_refunded_within_total CHECK (refunded_kobo BETWEEN 0 AND total_kobo),
  ADD CONSTRAINT invoices_refunded_when_paid CHECK (refunded_kobo = 0 OR status IN ('paid','refunded'));
ALTER TABLE invoice_lines
  ADD CONSTRAINT invoice_lines_refunded_within_total CHECK (
    refunded_kobo BETWEEN 0 AND total_kobo
    AND refunded_hammer_kobo BETWEEN 0 AND hammer_kobo
    AND refunded_premium_kobo BETWEEN 0 AND premium_kobo
    AND refunded_hammer_kobo + refunded_premium_kobo <= refunded_kobo);

-- The payment time is stamped once, by the payment itself.
CREATE FUNCTION stamp_invoice_paid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'paid' AND NEW.paid_at IS NULL THEN NEW.paid_at := CURRENT_TIMESTAMP; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invoices_stamp_paid BEFORE INSERT OR UPDATE OF status ON invoices
  FOR EACH ROW EXECUTE FUNCTION stamp_invoice_paid();

CREATE INDEX invoices_created_idx ON invoices (created_at, id);
CREATE INDEX invoices_refunded_idx ON invoices (created_at, id) WHERE refunded_kobo > 0;
CREATE INDEX users_name_trgm_idx ON users USING gin (name gin_trgm_ops);

-- Refunds: one person asks, another approves.
CREATE TABLE refund_requests (
  id uuid PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  requested_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  reason varchar(24) NOT NULL CHECK (reason IN ('not_as_described','damaged','missing_item','duplicate_charge','goodwill','other')),
  note_ciphertext bytea,
  amount_kobo bigint NOT NULL CHECK (amount_kobo BETWEEN 1 AND 9007199254740991),
  status varchar(12) NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected')),
  decided_by_id uuid REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  decided_at timestamptz(3),
  decision_ciphertext bytea,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT refund_requests_decided CHECK (
    (status = 'requested') = (decided_at IS NULL) AND (decided_at IS NULL) = (decided_by_id IS NULL)),
  CONSTRAINT refund_requests_two_people CHECK (decided_by_id IS NULL OR decided_by_id <> requested_by_id)
);
CREATE UNIQUE INDEX refund_requests_one_open ON refund_requests (invoice_id) WHERE status = 'requested';
CREATE INDEX refund_requests_invoice_idx ON refund_requests (invoice_id, created_at);
CREATE INDEX refund_requests_queue_idx ON refund_requests (status, created_at, id);
CREATE INDEX refund_requests_requested_by_idx ON refund_requests (requested_by_id);
CREATE INDEX refund_requests_decided_by_idx ON refund_requests (decided_by_id);
CREATE TABLE refund_request_lines (
  request_id uuid NOT NULL REFERENCES refund_requests(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  line_id uuid NOT NULL REFERENCES invoice_lines(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  PRIMARY KEY (request_id, line_id)
);
CREATE INDEX refund_request_lines_line_idx ON refund_request_lines (line_id);
-- A decided request and what it was for are history.
CREATE FUNCTION protect_refund_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.status <> 'requested'
    OR (NEW.id, NEW.invoice_id, NEW.requested_by_id, NEW.reason, NEW.amount_kobo, NEW.created_at)
      IS DISTINCT FROM (OLD.id, OLD.invoice_id, OLD.requested_by_id, OLD.reason, OLD.amount_kobo, OLD.created_at)
  THEN RAISE EXCEPTION 'refund request history is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER refund_requests_protected BEFORE UPDATE OR DELETE ON refund_requests
  FOR EACH ROW EXECUTE FUNCTION protect_refund_request();
CREATE FUNCTION reject_refund_line_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'refund request history is immutable'; END $$;
CREATE TRIGGER refund_request_lines_protected BEFORE UPDATE OR DELETE ON refund_request_lines
  FOR EACH ROW EXECUTE FUNCTION reject_refund_line_change();

-- Several refunds per invoice; fee_kobo is the premium and lot fee returned.
DROP INDEX staff_refunds_invoice_id_key;
CREATE INDEX staff_refunds_invoice_idx ON staff_refunds (invoice_id, created_at);
ALTER TABLE staff_refunds ADD COLUMN fee_kobo bigint NOT NULL DEFAULT 0,
  ADD COLUMN request_id uuid REFERENCES refund_requests(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX staff_refunds_request_id_key ON staff_refunds (request_id);
ALTER TABLE staff_refunds DISABLE TRIGGER staff_refunds_immutable;
UPDATE staff_refunds r SET fee_kobo = i.premium_kobo + i.lot_fee_kobo FROM invoices i WHERE i.id = r.invoice_id;
ALTER TABLE staff_refunds ENABLE TRIGGER staff_refunds_immutable;
ALTER TABLE staff_refunds ADD CONSTRAINT staff_refund_fee CHECK (fee_kobo BETWEEN 0 AND amount_kobo);

-- Net revenue gives back exactly the fees that were refunded.
DROP MATERIALIZED VIEW metrics_daily;
CREATE MATERIALIZED VIEW metrics_daily AS
WITH events AS (
  SELECT closed_day AS day, 0::bigint AS revenue, sum(hammer)::bigint AS gmv,
    count(*) FILTER (WHERE won)::bigint AS sold, count(*)::bigint AS closed,
    0::bigint AS listed, 0::bigint AS bid_lots, 0::bigint AS cohort_sold,
    0::bigint AS paid, 0::bigint AS collected
  FROM analytics_lot_facts WHERE closed_day IS NOT NULL GROUP BY closed_day
  UNION ALL
  SELECT listed_day, 0, 0, 0, 0, count(*), count(*) FILTER (WHERE accepted > 0),
    count(*) FILTER (WHERE won), count(*) FILTER (WHERE won AND paid),
    count(*) FILTER (WHERE won AND collected)
  FROM analytics_lot_facts WHERE listed_day IS NOT NULL GROUP BY listed_day
  UNION ALL
  SELECT (COALESCE(s.end_at, i.created_at) AT TIME ZONE 'Africa/Lagos')::date,
    sum(i.premium_kobo + i.lot_fee_kobo)::bigint, 0, 0, 0, 0, 0, 0, 0, 0
  FROM invoices i LEFT JOIN lot_settlements s ON s.invoice_id = i.id
  WHERE i.status IN ('paid','refunded') GROUP BY 1
  UNION ALL
  SELECT (r.created_at AT TIME ZONE 'Africa/Lagos')::date,
    -sum(r.fee_kobo)::bigint, 0, 0, 0, 0, 0, 0, 0, 0
  FROM staff_refunds r GROUP BY 1
  UNION ALL
  SELECT (settled_at AT TIME ZONE 'Africa/Lagos')::date, sum(storage_kobo)::bigint,
    0, 0, 0, 0, 0, 0, 0, 0
  FROM pickup_storage_payments WHERE status = 'paid' AND settled_at IS NOT NULL GROUP BY 1
)
SELECT day, sum(revenue)::bigint AS revenue, sum(gmv)::bigint AS gmv,
  sum(sold)::bigint AS sold, sum(closed)::bigint AS closed,
  sum(listed)::bigint AS listed, sum(bid_lots)::bigint AS bid_lots,
  sum(cohort_sold)::bigint AS cohort_sold, sum(paid)::bigint AS paid,
  sum(collected)::bigint AS collected
FROM events GROUP BY day;
CREATE UNIQUE INDEX metrics_daily_day_idx ON metrics_daily(day);

-- Batch money back follows partial refunds.
CREATE TRIGGER invoice_lines_refund_recalc AFTER UPDATE OF refunded_kobo ON invoice_lines
  FOR EACH ROW EXECUTE FUNCTION queue_batch_recalc_for_lot_id();

CREATE TABLE invoice_notes (
  id uuid PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  body_ciphertext bytea NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX invoice_notes_invoice_idx ON invoice_notes (invoice_id, created_at, id);
CREATE INDEX invoice_notes_author_idx ON invoice_notes (author_id);

-- Open while its support conversation isn't resolved.
CREATE TABLE invoice_disputes (
  conversation_id uuid PRIMARY KEY REFERENCES support_conversations(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  opened_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX invoice_disputes_invoice_idx ON invoice_disputes (invoice_id, created_at);
CREATE INDEX invoice_disputes_opened_by_idx ON invoice_disputes (opened_by_id);

-- Printed on invoices; blank details are left off, never made up.
CREATE TABLE company_details (
  id smallint PRIMARY KEY CHECK (id = 1),
  details jsonb NOT NULL DEFAULT '{}',
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO company_details (id, details) VALUES
  (1, '{"name":"GiddyDeal","parent":"A subsidiary of Giddy Host Nigeria","email":"hello@giddydeal.ng"}');

-- Open staff screens refresh silently.
CREATE FUNCTION capture_invoice_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'invoices' THEN source_id := NEW.id;
  ELSE source_id := NEW.invoice_id; END IF;
  INSERT INTO staff_activity_events (source_key, kind, entity_id)
    VALUES ('workspace.changed:invoice:' || source_id::text || ':' || txid_current()::text, 'workspace.changed', source_id)
    ON CONFLICT (source_key) DO NOTHING;
  RETURN NULL;
END $$;
CREATE TRIGGER staff_invoice_refunded_event AFTER UPDATE OF refunded_kobo ON invoices
  FOR EACH ROW EXECUTE FUNCTION capture_invoice_change();
CREATE TRIGGER staff_refund_request_event AFTER INSERT OR UPDATE ON refund_requests
  FOR EACH ROW EXECUTE FUNCTION capture_invoice_change();
CREATE TRIGGER staff_invoice_note_event AFTER INSERT ON invoice_notes
  FOR EACH ROW EXECUTE FUNCTION capture_invoice_change();
CREATE TRIGGER staff_invoice_dispute_event AFTER INSERT ON invoice_disputes
  FOR EACH ROW EXECUTE FUNCTION capture_invoice_change();

ALTER TABLE staff_roles DROP CONSTRAINT staff_role_permissions;
ALTER TABLE staff_roles ADD CONSTRAINT staff_role_permissions CHECK(permissions <@ ARRAY['dashboard.view','inventory.read','inventory.write','auctions.manage','pickup.manage','buyers.read','buyers.manage','support.manage','finance.read','refunds.manage','withdrawals.manage','wallet.manage','fees.manage','bids.cancel','audit.read','records.archive','staff.manage','records.purge','setup.manage','setup.read','bids.read','storage.manage','storage.adjust','lots.relist','lots.delete','batches.read','batches.receive','batches.manage','batches.costs','suppliers.read','suppliers.bank','lots.cost','invoices.read','invoices.manage','refunds.request','company.manage']::text[] AND revision>0);
UPDATE staff_roles SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['invoices.read','invoices.manage','refunds.request','refunds.manage']))
  WHERE built_in AND key IN ('manager','finance');
UPDATE staff_roles SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['invoices.read','invoices.manage','refunds.request']))
  WHERE built_in AND key = 'support';
