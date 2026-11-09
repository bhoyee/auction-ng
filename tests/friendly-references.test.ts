import { expect, it } from 'vitest';
import { lotNumberInputSchema } from '../packages/shared/src/references';

it.each(['LOT-K7M4X9Q2', 'LAG-104', 'DEMO-0001'])(
  'accepts the readable lot reference %s',
  (value) => {
    expect(lotNumberInputSchema.parse(value)).toBe(value);
  },
);
it('rejects a UUID as a buyer-facing lot reference while keeping existing friendly codes valid', () => {
  expect(
    lotNumberInputSchema.safeParse('89d04dce-9cef-4ba5-9596-bd43d1a89851')
      .success,
  ).toBe(false);
});
