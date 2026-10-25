ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_id_user_id_key UNIQUE(id,user_id);
ALTER TABLE bid_funding_intents ADD CONSTRAINT bid_intents_owned_wallet_fk FOREIGN KEY(wallet_id,user_id) REFERENCES wallets(id,user_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE bid_funding_intents ADD CONSTRAINT bid_intents_owned_session_fk FOREIGN KEY(session_id,user_id) REFERENCES auth_sessions(id,user_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE FUNCTION guard_bid_funding_intent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'bid funding intents cannot be deleted'; END IF;
  IF (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN RAISE EXCEPTION 'bid funding contract is immutable'; END IF;
  IF OLD.status='released' AND NEW.status<>'released' OR OLD.status='retained' AND NEW.status='pending' THEN RAISE EXCEPTION 'bid funding state cannot be reopened'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bid_funding_intents_immutable BEFORE UPDATE OR DELETE ON bid_funding_intents FOR EACH ROW EXECUTE FUNCTION guard_bid_funding_intent();
