import { expect, it } from 'vitest';
import { canCancelWithdrawal } from '../packages/shared/src/withdrawal-schemas';
it.each(['draft', 'review'])(
  'allows cancellation before approval: %s',
  (status) => expect(canCancelWithdrawal(status)).toBe(true),
);
it.each([
  'queued',
  'processing',
  'pending',
  'success',
  'failed',
  'reversed',
  'rejected',
  'cancelled',
])('protects approved or terminal requests: %s', (status) =>
  expect(canCancelWithdrawal(status)).toBe(false),
);
