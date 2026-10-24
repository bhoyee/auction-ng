import { expect, it } from 'vitest';
import {
  bidSchema,
  lotSchema,
  userSchema,
  walletSchema,
  koboSchema,
} from '../packages/shared/src/schemas';

const id = '11111111-1111-4111-8111-111111111111';
const lot = {
  id,
  title: 'Standing fan',
  categoryId: id,
  locationId: id,
  condition: 'open_box',
  status: 'open',
  startPriceKobo: 50000,
  currentPriceKobo: null,
  startsAt: '2026-10-24T17:00:00.000Z',
  endsAt: '2026-10-24T18:00:00.000Z',
};
it('validates strict public lot DTOs and price/time invariants', () => {
  expect(lotSchema.parse(lot)).toEqual(lot);
  expect(lotSchema.safeParse({ ...lot, currentPriceKobo: 60000 }).success).toBe(
    true,
  );
  for (const changes of [
    { currentPriceKobo: 1 },
    { startPriceKobo: 0 },
    { endsAt: lot.startsAt },
    { title: '' },
    { condition: 'invented' },
    { leaderMaxKobo: 100000 },
    { startsAt: 'yesterday' },
  ])
    expect(lotSchema.safeParse({ ...lot, ...changes }).success).toBe(false);
});
it('rejects coerced, fractional, negative and unsafe money', () => {
  for (const value of ['100', null, -1, 0.5, Infinity, NaN, 9007199254740992])
    expect(koboSchema.safeParse(value).success).toBe(false);
});
it('requires positive max and UUID idempotency in bid requests', () => {
  const bid = { lotId: id, maxKobo: 50000, idempotencyKey: id };
  expect(bidSchema.parse(bid)).toEqual(bid);
  for (const changes of [
    { maxKobo: 0 },
    { idempotencyKey: '' },
    { lotId: 'bad' },
    { userId: id },
  ])
    expect(bidSchema.safeParse({ ...bid, ...changes }).success).toBe(false);
});
it('validates user and wallet DTOs without allowing private fields', () => {
  const user = {
    id,
    name: 'Chiamaka',
    role: 'buyer',
    status: 'active',
    phoneVerified: false,
  };
  const wallet = {
    id,
    userId: id,
    currency: 'NGN',
    availableKobo: 0,
    heldKobo: 100,
  };
  expect(userSchema.parse(user)).toEqual(user);
  expect(walletSchema.parse(wallet)).toEqual(wallet);
  expect(
    userSchema.safeParse({ ...user, phone: '+2348031234567' }).success,
  ).toBe(false);
  expect(userSchema.safeParse({ ...user, role: 'superuser' }).success).toBe(
    false,
  );
  expect(walletSchema.safeParse({ ...wallet, availableKobo: -1 }).success).toBe(
    false,
  );
  expect(walletSchema.safeParse({ ...wallet, currency: 'USD' }).success).toBe(
    false,
  );
});
