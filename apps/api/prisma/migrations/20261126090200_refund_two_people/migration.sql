-- Two people per refund, a manager and an admin, who may have asked for it
-- themselves (owner decision 2026-11-24). They are never the same person.
ALTER TABLE refund_requests DROP CONSTRAINT refund_requests_two_people,
  DROP CONSTRAINT refund_requests_first_other,
  ADD CONSTRAINT refund_requests_two_people CHECK (
    first_approved_by_id IS NULL OR decided_by_id IS NULL OR decided_by_id <> first_approved_by_id);
