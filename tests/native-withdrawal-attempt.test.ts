import { expect, it } from 'vitest';
import type { WithdrawalStartInput } from '../packages/shared/src/withdrawal-schemas';
import {
  withdrawalAttempt,
  withdrawalStartError,
  withdrawalConfirmationError,
} from '../apps/mobile/lib/withdrawal-attempt';
import { ApiError } from '../packages/api-client/src/auth';

const original: WithdrawalStartInput = {
  bankId: '11111111-1111-4111-8111-111111111111',
  amountKobo: 100000,
  acceptedTotalKobo: 101000,
  password: 'synthetic-incorrect-proof',
  idempotencyKey: '22222222-2222-4222-8222-222222222222',
};
it.each([
  [new ApiError(422, 'TWO_FACTOR_INVALID'), 'new authenticator code'],
  [new ApiError(422, 'TWO_FACTOR_REQUIRED'), 'authenticator code'],
  [new ApiError(400), 'email code'],
  [new ApiError(401), 'Sign in again'],
  [new ApiError(409), 'bank account'],
  [new ApiError(429), 'Too many attempts'],
  [new ApiError(503), 'server'],
  [new Error('private details'), 'same withdrawal'],
])('explains confirmation failure safely: %s', (error, text) => {
  const message = withdrawalConfirmationError(error);
  expect(message).toContain(text);
  expect(message).not.toContain('private details');
});
it('offers password correction for an authentication rejection', () => {
  expect(withdrawalStartError(new ApiError(401))).toContain(
    'password could not be verified',
  );
});
it('keeps uncertain outcomes on the same request without exposing internal errors', () => {
  expect(withdrawalStartError(new Error('private implementation detail'))).toBe(
    'The request could not be confirmed. Retry this same withdrawal.',
  );
});
it('asks throttled users to wait rather than create another request', () => {
  expect(withdrawalStartError(new ApiError(429))).toContain('Wait a little');
  expect(withdrawalStartError(new ApiError(429))).toContain('same withdrawal');
});

it('allows correcting a rejected password without creating a new withdrawal reference', () => {
  const corrected = withdrawalAttempt(original, {
    ...original,
    password: 'synthetic-correct-proof',
  });
  expect(corrected).toEqual({
    ...original,
    password: 'synthetic-correct-proof',
  });
  expect(original.password).toBe('synthetic-incorrect-proof');
});
it('retains the pending bank, amount, accepted fees and idempotency key after an uncertain result', () => {
  const retry = withdrawalAttempt(original, {
    bankId: '33333333-3333-4333-8333-333333333333',
    amountKobo: 900000,
    acceptedTotalKobo: 950000,
    password: 'synthetic-new-proof',
    idempotencyKey: '44444444-4444-4444-8444-444444444444',
  });
  expect(retry).toEqual({ ...original, password: 'synthetic-new-proof' });
});
it('snapshots the first request and returns stable exact retry values', () => {
  const first = withdrawalAttempt(undefined, original);
  expect(first).toEqual(original);
  expect(first).not.toBe(original);
  expect(withdrawalAttempt(first, original)).toEqual(first);
});
