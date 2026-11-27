-- Recent searches for signed-in buyers (2026-11-27). One row per buyer and
-- search wording (compared without capitals), newest first. The API keeps at
-- most 20 per buyer and removes older ones.
CREATE TABLE buyer_search_history (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  query_key text NOT NULL CHECK (char_length(query_key) BETWEEN 1 AND 120),
  query text NOT NULL CHECK (char_length(query) BETWEEN 1 AND 120),
  searched_at timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, query_key)
);
CREATE INDEX buyer_search_history_recent_idx ON buyer_search_history (user_id, searched_at DESC, query_key);
