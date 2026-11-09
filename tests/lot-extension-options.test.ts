import { expect, it } from 'vitest';
import { lotControlInputSchema } from '../packages/shared/src/admin-live-schemas';
it('accepts the owner-approved thirty-minute extension and rejects arbitrary durations', () => {
  const input = {
    idempotencyKey: '10000000-0000-4000-8000-000000000001',
    lotId: '10000000-0000-4000-8000-000000000002',
    operation: 'extend',
    expectedRevision: '0-0',
    reason: 'Additional time after a service outage',
  };
  expect(
    lotControlInputSchema.safeParse({ ...input, extensionMs: 1800000 }).success,
  ).toBe(true);
  expect(
    lotControlInputSchema.safeParse({ ...input, extensionMs: 1800001 }).success,
  ).toBe(false);
});
