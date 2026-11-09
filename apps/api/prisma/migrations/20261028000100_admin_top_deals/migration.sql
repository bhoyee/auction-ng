ALTER TABLE lots
  ADD COLUMN is_top_deal boolean NOT NULL DEFAULT false,
  ADD COLUMN top_deal_order integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT lots_top_deal_order_check CHECK (top_deal_order BETWEEN 0 AND 9999);

CREATE INDEX lots_top_deal_order_idx ON lots (is_top_deal, top_deal_order, id);
