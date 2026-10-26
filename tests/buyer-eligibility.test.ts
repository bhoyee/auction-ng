import { expect, it } from 'vitest';
import { isBuyerEligible } from '../packages/shared/src/buyer-eligibility';

it.each([
  ['buyer', 'active', true, true],
  ['buyer', 'active', false, false],
  ['buyer', 'suspended', true, false],
  ['buyer', 'suspended', false, false],
  ['admin', 'active', true, false],
  ['intake', 'active', true, false],
  ['warehouse', 'active', true, false],
  ['finance', 'active', true, false],
  ['support', 'active', true, false],
  ['supplier', 'active', true, false],
  ['unknown', 'active', true, false],
])(
  'checks buyer eligibility for %s / %s / verified email %s',
  (role, status, emailVerified, expected) => {
    expect(isBuyerEligible({ role, status, emailVerified })).toBe(expected);
  },
);
