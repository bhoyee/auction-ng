ALTER TABLE notifications ADD COLUMN staff_permission varchar(40);
CREATE INDEX notifications_staff_inbox_idx ON notifications(user_id,template,staff_permission,read_at,created_at,id);
CREATE TABLE staff_activity_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_key varchar(240) NOT NULL UNIQUE,
 kind varchar(40) NOT NULL CHECK(kind IN ('withdrawal.review','bid-cancellation.review','support.open','support.reply','sale.completed','workspace.changed')),
 entity_id uuid NOT NULL, recipient_cursor uuid,
 created_at timestamptz(3) NOT NULL DEFAULT now(), processed_at timestamptz(3)
);
CREATE INDEX staff_activity_pending_idx ON staff_activity_events(processed_at,created_at,id);
CREATE INDEX staff_activity_priority_idx ON staff_activity_events((CASE WHEN kind='workspace.changed' THEN 1 ELSE 0 END),created_at,id) WHERE processed_at IS NULL;
CREATE FUNCTION capture_staff_activity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event_kind text; source_id uuid; event_key text;
BEGIN
 source_id := NEW.id;
 IF TG_TABLE_NAME='withdrawals' THEN
   IF NEW.status='review' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN event_kind:='withdrawal.review'; END IF;
 ELSIF TG_TABLE_NAME='support_conversations' THEN
   IF NEW.bid_cancellation_fee_consent_at IS NOT NULL AND (TG_OP='INSERT' OR OLD.bid_cancellation_fee_consent_at IS NULL) THEN event_kind:='bid-cancellation.review';
   ELSIF NEW.mode='human' AND NEW.bid_cancellation_fee_consent_at IS NULL AND (TG_OP='INSERT' OR OLD.mode IS DISTINCT FROM NEW.mode) THEN event_kind:='support.open'; END IF;
 ELSIF TG_TABLE_NAME='support_messages' THEN
   IF NEW.kind='buyer' AND NEW.sequence>1 AND NOT NEW.internal AND EXISTS(SELECT 1 FROM support_conversations WHERE id=NEW.conversation_id AND mode='human') THEN event_kind:='support.reply'; source_id:=NEW.conversation_id; END IF;
 ELSIF TG_TABLE_NAME='invoices' THEN
   IF NEW.status='paid' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN event_kind:='sale.completed'; END IF;
 ELSE event_kind:='workspace.changed';
 END IF;
 IF event_kind IS NULL AND TG_TABLE_NAME IN ('withdrawals','invoices','support_conversations') THEN event_kind:='workspace.changed'; END IF;
 IF event_kind IS NOT NULL THEN
   event_key:=event_kind||':'||NEW.id::text;
   IF event_kind='workspace.changed' THEN event_key:=event_key||':'||txid_current()::text; END IF;
   INSERT INTO staff_activity_events(source_key,kind,entity_id) VALUES(event_key,event_kind,source_id) ON CONFLICT(source_key) DO NOTHING;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER staff_withdrawal_event AFTER INSERT OR UPDATE OF status ON withdrawals FOR EACH ROW EXECUTE FUNCTION capture_staff_activity();
CREATE TRIGGER staff_support_event AFTER INSERT OR UPDATE OF mode,status,bid_cancellation_fee_consent_at ON support_conversations FOR EACH ROW EXECUTE FUNCTION capture_staff_activity();
CREATE TRIGGER staff_support_reply_event AFTER INSERT ON support_messages FOR EACH ROW EXECUTE FUNCTION capture_staff_activity();
CREATE TRIGGER staff_sale_event AFTER INSERT OR UPDATE OF status ON invoices FOR EACH ROW EXECUTE FUNCTION capture_staff_activity();
CREATE TRIGGER staff_inventory_event AFTER INSERT OR UPDATE OF status,archived_at ON lots FOR EACH ROW EXECUTE FUNCTION capture_staff_activity();
CREATE TRIGGER staff_action_event AFTER INSERT ON staff_actions FOR EACH ROW EXECUTE FUNCTION capture_staff_activity();
-- Outstanding reviews should be visible when the staff inbox is first enabled.
INSERT INTO staff_activity_events(source_key,kind,entity_id) SELECT 'withdrawal.review:'||id::text,'withdrawal.review',id FROM withdrawals WHERE status='review' ON CONFLICT DO NOTHING;
INSERT INTO staff_activity_events(source_key,kind,entity_id) SELECT 'bid-cancellation.review:'||id::text,'bid-cancellation.review',id FROM support_conversations WHERE bid_cancellation_fee_consent_at IS NOT NULL AND status<>'resolved' ON CONFLICT DO NOTHING;
INSERT INTO staff_activity_events(source_key,kind,entity_id) SELECT 'support.open:'||id::text,'support.open',id FROM support_conversations WHERE mode='human' AND bid_cancellation_fee_consent_at IS NULL AND status<>'resolved' ON CONFLICT DO NOTHING;
