BEGIN;
ALTER TABLE withdrawals ADD COLUMN settled_fee_kobo BIGINT,
 ADD COLUMN returned_kobo BIGINT,
 ADD CONSTRAINT withdrawal_receipt_amounts CHECK (
 (settled_fee_kobo IS NULL OR settled_fee_kobo BETWEEN 0 AND total_kobo)
 AND (returned_kobo IS NULL OR returned_kobo BETWEEN 0 AND total_kobo));
COMMIT;
