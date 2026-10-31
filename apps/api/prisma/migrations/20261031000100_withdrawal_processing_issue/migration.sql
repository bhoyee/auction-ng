ALTER TABLE withdrawals ADD COLUMN processing_issue VARCHAR(32);
ALTER TABLE withdrawals ADD CONSTRAINT withdrawals_processing_issue_check
  CHECK (processing_issue IS NULL OR processing_issue = 'provider_account');
