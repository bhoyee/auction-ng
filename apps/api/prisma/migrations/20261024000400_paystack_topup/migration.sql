ALTER TABLE users ADD COLUMN wallet_consented_at timestamptz(3), ADD COLUMN topup_fee_policy varchar(40);
ALTER TABLE users ADD CONSTRAINT users_topup_consent CHECK ((wallet_consented_at IS NULL AND topup_fee_policy IS NULL) OR (wallet_consented_at IS NOT NULL AND topup_fee_policy='paystack-dva-v1'));
ALTER TABLE virtual_accounts ADD COLUMN customer_code varchar(160);
CREATE UNIQUE INDEX virtual_accounts_customer_code_key ON virtual_accounts(customer_code);
ALTER TABLE payments ADD COLUMN fee_kobo bigint, ADD COLUMN credit_kobo bigint;
ALTER TABLE payments ADD CONSTRAINT payments_net_amount CHECK ((fee_kobo IS NULL AND credit_kobo IS NULL) OR (fee_kobo IS NOT NULL AND credit_kobo IS NOT NULL AND fee_kobo>=0 AND credit_kobo>0 AND amount_kobo::numeric=fee_kobo::numeric+credit_kobo::numeric));
