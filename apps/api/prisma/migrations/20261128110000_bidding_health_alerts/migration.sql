-- Bid engine health alerts (2026-11-28): every admin is told by email,
-- in the dashboard and on WhatsApp when bidding stays paused after a
-- restart, or resumes by itself after a verified one.
ALTER TABLE staff_activity_events DROP CONSTRAINT staff_activity_events_kind_check;
ALTER TABLE staff_activity_events ADD CONSTRAINT staff_activity_events_kind_check
  CHECK (kind IN ('withdrawal.review', 'bid-cancellation.review', 'support.open',
    'support.reply', 'sale.completed', 'workspace.changed',
    'bidding.paused', 'bidding.resumed'));
