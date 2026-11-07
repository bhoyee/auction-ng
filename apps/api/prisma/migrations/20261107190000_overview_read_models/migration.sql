-- Read-only projections: no bid, wallet, invoice or ledger state is changed.
CREATE TABLE analytics_snapshots (
  id smallint PRIMARY KEY CHECK (id = 1),
  generated_at timestamptz(3) NOT NULL,
  metrics_at timestamptz(3),
  payload jsonb NOT NULL
);

CREATE INDEX bid_acceptances_analytics_time_idx ON bid_acceptances(created_at, id);
CREATE INDEX lot_settlements_analytics_time_idx ON lot_settlements(end_at, lot_id);
CREATE INDEX lots_analytics_launch_idx ON lots(start_at, id);
CREATE INDEX storage_payments_analytics_settled_idx ON pickup_storage_payments(settled_at, id) WHERE status = 'paid';

CREATE MATERIALIZED VIEW analytics_lot_facts AS
SELECT l.id, l.title, l.lot_number, l.category_id, l.location_id, c.name AS category,
  CASE WHEN l.start_at <= now() AND l.status NOT IN ('draft','scheduled')
    THEN (l.start_at AT TIME ZONE 'Africa/Lagos')::date END AS listed_day,
  (s.end_at AT TIME ZONE 'Africa/Lagos')::date AS closed_day,
  s.end_at AS closed_at,
  (s.winner_id IS NOT NULL) AS won,
  CASE WHEN s.winner_id IS NOT NULL THEN s.hammer_kobo ELSE 0 END::bigint AS hammer,
  l.retail_price_kobo AS retail,
  COALESCE(b.accepted, 0)::bigint AS accepted,
  (i.status IN ('paid','refunded')) AS paid,
  (pc.invoice_line_id IS NOT NULL OR f.collected_at IS NOT NULL) AS collected
FROM lots l
JOIN categories c ON c.id = l.category_id
LEFT JOIN lot_settlements s ON s.lot_id = l.id
LEFT JOIN invoice_lines il ON il.lot_id = l.id
LEFT JOIN invoices i ON i.id = il.invoice_id
LEFT JOIN fulfilments f ON f.invoice_id = i.id
LEFT JOIN pickup_collection_items pc ON pc.invoice_line_id = il.id
LEFT JOIN (
  SELECT bi.lot_id, count(*)::bigint AS accepted
  FROM bid_acceptances a JOIN bid_funding_intents bi ON bi.id = a.id GROUP BY bi.lot_id
) b ON b.lot_id = l.id;
CREATE UNIQUE INDEX analytics_lot_facts_id_idx ON analytics_lot_facts(id);
CREATE INDEX analytics_lot_facts_close_idx ON analytics_lot_facts(closed_day, hammer DESC);
CREATE INDEX analytics_lot_facts_launch_idx ON analytics_lot_facts(listed_day);

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
    -sum(i.premium_kobo + i.lot_fee_kobo)::bigint, 0, 0, 0, 0, 0, 0, 0, 0
  FROM staff_refunds r JOIN invoices i ON i.id = r.invoice_id GROUP BY 1
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

CREATE MATERIALIZED VIEW analytics_category_daily AS
SELECT closed_day AS day, category_id, location_id, category, sum(hammer)::bigint AS gmv
FROM analytics_lot_facts WHERE won AND closed_day IS NOT NULL
GROUP BY closed_day, category_id, location_id, category;
CREATE UNIQUE INDEX analytics_category_daily_key_idx ON analytics_category_daily(day, category_id, location_id);

CREATE MATERIALIZED VIEW analytics_bidder_daily AS
SELECT DISTINCT (a.created_at AT TIME ZONE 'Africa/Lagos')::date AS day,
  encode(sha256(convert_to('lotvanta-analytics:' || bi.user_id::text, 'UTF8')), 'hex') AS bidder
FROM bid_acceptances a JOIN bid_funding_intents bi ON bi.id = a.id;
CREATE UNIQUE INDEX analytics_bidder_daily_key_idx ON analytics_bidder_daily(day, bidder);
