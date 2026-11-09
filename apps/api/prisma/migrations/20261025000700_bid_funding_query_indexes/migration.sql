CREATE INDEX bid_funding_user_created_idx ON bid_funding_intents(user_id,created_at,id);
CREATE INDEX bid_funding_poll_idx ON bid_funding_intents(namespace,id) WHERE status<>'released';
