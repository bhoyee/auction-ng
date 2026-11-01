CREATE TABLE pickup_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL, location_id UUID NOT NULL,
  registered_by_id UUID, status VARCHAR(24) NOT NULL DEFAULT 'waiting',
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, finished_at TIMESTAMPTZ(3),
  CONSTRAINT pickup_visits_user_id_fkey FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT pickup_visits_location_id_fkey FOREIGN KEY(location_id) REFERENCES locations(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT pickup_visits_registered_by_id_fkey FOREIGN KEY(registered_by_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT pickup_visits_status_check CHECK ((status='waiting' AND finished_at IS NULL) OR (status IN ('completed','cancelled') AND finished_at IS NOT NULL))
);
CREATE UNIQUE INDEX pickup_visits_one_active ON pickup_visits(user_id,location_id) WHERE status='waiting';
CREATE INDEX pickup_visits_status_created_at_id_idx ON pickup_visits(status,created_at,id);
CREATE INDEX pickup_visits_user_id_location_id_created_at_id_idx ON pickup_visits(user_id,location_id,created_at,id);
CREATE INDEX pickup_visits_location_id_status_created_at_id_idx ON pickup_visits(location_id,status,created_at,id);
CREATE INDEX pickup_visits_registered_by_id_idx ON pickup_visits(registered_by_id);

CREATE TABLE pickup_visit_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL, location_id UUID NOT NULL,
  token_hash VARCHAR(64) NOT NULL, token_ciphertext BYTEA NOT NULL,
  code_hash VARCHAR(64) NOT NULL, code_ciphertext BYTEA NOT NULL,
  expires_at TIMESTAMPTZ(3) NOT NULL, visit_id UUID,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pickup_visit_passes_user_id_fkey FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT pickup_visit_passes_location_id_fkey FOREIGN KEY(location_id) REFERENCES locations(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT pickup_visit_passes_visit_id_fkey FOREIGN KEY(visit_id) REFERENCES pickup_visits(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX pickup_visit_passes_user_id_location_id_key ON pickup_visit_passes(user_id,location_id);
CREATE UNIQUE INDEX pickup_visit_passes_token_hash_key ON pickup_visit_passes(token_hash);
CREATE UNIQUE INDEX pickup_visit_passes_code_hash_key ON pickup_visit_passes(code_hash);
CREATE INDEX pickup_visit_passes_visit_id_idx ON pickup_visit_passes(visit_id);
CREATE INDEX pickup_visit_passes_location_id_idx ON pickup_visit_passes(location_id);

CREATE TABLE pickup_collection_receipts (
  id UUID PRIMARY KEY, visit_id UUID NOT NULL, staff_id UUID NOT NULL,
  finish_visit BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pickup_collection_receipts_visit_id_fkey FOREIGN KEY(visit_id) REFERENCES pickup_visits(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT pickup_collection_receipts_staff_id_fkey FOREIGN KEY(staff_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX pickup_collection_receipts_visit_id_created_at_id_idx ON pickup_collection_receipts(visit_id,created_at,id);
CREATE INDEX pickup_collection_receipts_staff_id_created_at_id_idx ON pickup_collection_receipts(staff_id,created_at,id);

CREATE TABLE pickup_collection_items (
  invoice_line_id UUID PRIMARY KEY, receipt_id UUID NOT NULL,
  CONSTRAINT pickup_collection_items_invoice_line_id_fkey FOREIGN KEY(invoice_line_id) REFERENCES invoice_lines(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT pickup_collection_items_receipt_id_fkey FOREIGN KEY(receipt_id) REFERENCES pickup_collection_receipts(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX pickup_collection_items_receipt_id_idx ON pickup_collection_items(receipt_id);

-- Preserve existing customer arrivals as one waiting visit per buyer/centre.
-- Legacy records are retained intact for history; no collection is inferred.
INSERT INTO pickup_visits(user_id,location_id,created_at)
SELECT a.user_id,f.location_id,MIN(a.created_at)
FROM pickup_arrivals a JOIN fulfilments f ON f.id=a.fulfilment_id JOIN invoices i ON i.id=f.invoice_id
WHERE a.status IN ('waiting','acknowledged') AND i.status='paid' AND f.type='pickup'
  AND f.status IN ('pending','booked','ready') AND f.collected_at IS NULL
GROUP BY a.user_id,f.location_id;
