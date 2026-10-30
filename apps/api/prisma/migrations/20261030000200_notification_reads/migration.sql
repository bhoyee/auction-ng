ALTER TABLE notifications ADD COLUMN read_at TIMESTAMPTZ(3);
CREATE INDEX notifications_buyer_unread_idx ON notifications(user_id, template, read_at, created_at, id);
CREATE INDEX fulfilments_buyer_pickup_idx ON fulfilments(user_id, type, status, invoice_id);
