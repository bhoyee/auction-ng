import { describe, expect, it } from 'vitest';
import { bidOutcome } from '../apps/api/src/buyers/buyer-service';

const lot = (overrides: Partial<Parameters<typeof bidOutcome>[1]> = {}) => ({
  bidRound: 1,
  settlement: null,
  cancellationApprovals: [],
  purchases: [],
  ...overrides,
});

describe('bidOutcome', () => {
  it.each([
    ['open, current round', lot(), 1, 'pending'],
    ['reopened round', lot({ bidRound: 2 }), 1, 'cancelled'],
    [
      'staff-approved cancellation',
      lot({ cancellationApprovals: [{}] }),
      1,
      'cancelled',
    ],
    ['fixed-price sale', lot({ purchases: [{}] }), 1, 'cancelled'],
    ['settled to the buyer', lot({ settlement: { winnerId: 'me' } }), 1, 'won'],
    [
      'settled to another',
      lot({ settlement: { winnerId: 'them' } }),
      1,
      'lost',
    ],
    ['settled unsold', lot({ settlement: { winnerId: null } }), 1, 'lost'],
  ] as const)('%s', (_label, value, round, expected) => {
    expect(bidOutcome('me', value, round)).toBe(expected);
  });
});
