-- Extend accepted funding variants; retain immutable-intent trigger and net-amount constraints.
ALTER TABLE payments DROP CONSTRAINT payments_funding_metadata;
ALTER TABLE payments ADD CONSTRAINT payments_funding_metadata CHECK (
  (funding_method IS NULL AND fee_policy IS NULL AND card_type IS NULL AND initialization_key IS NULL AND checkout_url_ciphertext IS NULL AND initialization_attempted_at IS NULL AND consented_at IS NULL)
  OR (funding_method IS NOT NULL AND funding_method='bank_transfer' AND fee_policy IS NOT NULL AND fee_policy='paystack-dva-v1' AND card_type IS NULL AND initialization_key IS NULL AND checkout_url_ciphertext IS NULL AND initialization_attempted_at IS NULL)
  OR (funding_method IS NOT NULL AND funding_method='card' AND card_type IS NOT NULL AND card_type IN ('local','international') AND fee_policy IS NOT NULL AND fee_policy=CASE WHEN card_type='local' THEN 'paystack-card-local-v1' ELSE 'paystack-card-international-v1' END AND initialization_key IS NOT NULL AND consented_at IS NOT NULL AND fee_kobo IS NOT NULL AND credit_kobo IS NOT NULL AND (checkout_url_ciphertext IS NULL OR initialization_attempted_at IS NOT NULL))
  OR (funding_method IS NOT NULL AND funding_method='checkout_transfer' AND fee_policy IS NOT NULL AND fee_policy='paystack-transfer-v1' AND card_type IS NULL AND initialization_key IS NOT NULL AND consented_at IS NOT NULL AND fee_kobo IS NOT NULL AND credit_kobo IS NOT NULL AND (checkout_url_ciphertext IS NULL OR initialization_attempted_at IS NOT NULL))
);
