import { expect, it } from 'vitest';
import { withdrawalStatusSchema } from '../packages/shared/src/withdrawal-schemas';
import {
  withdrawalBadge,
  withdrawalConfirmationFeedback,
} from '../apps/mobile/lib/withdrawal-presentation';
it('gives every withdrawal status a readable label and distinguishes completed, failed and pending states', () => {
  for (const status of withdrawalStatusSchema.options)
    expect(withdrawalBadge(status).label.length).toBeGreaterThan(0);
  expect(withdrawalBadge('success').tone).toBe('success');
  expect(withdrawalBadge('draft').tone).toBe('neutral');
  for (const status of ['cancelled', 'failed', 'rejected'] as const)
    expect(withdrawalBadge(status).tone).toBe('danger');
  expect(withdrawalBadge('pending').tone).toBe('warning');
  expect(withdrawalBadge('queued', true)).toEqual({
    label: 'Provider action needed',
    tone: 'warning',
  });
});
it.each(['review', 'queued', 'processing', 'pending'] as const)(
  'clears accepted %s input without claiming the bank transfer succeeded',
  (status) => {
    const feedback = withdrawalConfirmationFeedback(status);
    expect(feedback.clearAmount).toBe(true);
    expect(feedback.tone).toBe('warning');
    expect(feedback.message).not.toContain('successful');
  },
);
it('only shows confirmed bank success as success', () => {
  expect(withdrawalConfirmationFeedback('success')).toEqual({
    clearAmount: true,
    tone: 'success',
    message: 'Withdrawal successful. Your bank transfer is confirmed.',
  });
});
it.each(['draft', 'cancelled', 'failed', 'rejected', 'reversed'] as const)(
  'preserves the amount when %s has not accepted a new withdrawal',
  (status) => {
    expect(withdrawalConfirmationFeedback(status).clearAmount).toBe(false);
    expect(withdrawalConfirmationFeedback(status).tone).not.toBe('success');
  },
);
