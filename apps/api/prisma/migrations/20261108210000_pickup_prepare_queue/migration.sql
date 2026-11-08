-- Staff preparation queue: uncollected pickup fulfilments ordered by payment
-- time (fulfilment creation commits with the paid invoice). Partial, so it
-- only holds the small set of items still awaiting collection.
CREATE INDEX fulfilments_prepare_queue_idx ON fulfilments(created_at, id) WHERE type='pickup' AND collected_at IS NULL;
