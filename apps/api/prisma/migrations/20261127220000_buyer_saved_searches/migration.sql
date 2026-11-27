-- Saved searches (2026-11-27, search & retention step 2). A buyer keeps at
-- most 20; the same words and filters are saved once (filter_key).
CREATE TABLE buyer_saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  query text NOT NULL CHECK (char_length(query) BETWEEN 1 AND 120),
  category_id uuid REFERENCES categories(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  location_id uuid REFERENCES locations(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  max_price_kobo bigint CHECK (max_price_kobo BETWEEN 1 AND 9007199254740991),
  filter_key text NOT NULL CHECK (char_length(filter_key) BETWEEN 1 AND 260),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE (user_id, filter_key)
);
CREATE INDEX buyer_saved_searches_owner_idx ON buyer_saved_searches (user_id, created_at DESC, id);
CREATE INDEX buyer_saved_searches_category_idx ON buyer_saved_searches (category_id) WHERE category_id IS NOT NULL;
CREATE INDEX buyer_saved_searches_location_idx ON buyer_saved_searches (location_id) WHERE location_id IS NOT NULL;
