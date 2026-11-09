import { expect, it } from 'vitest';
import {
  calculateInvoiceLine,
  effectiveAuctionFeeRules,
  LEGACY_AUCTION_FEE_POLICY,
} from '../packages/shared/src/fees';
import { auctionFeeUpdateSchema } from '../packages/shared/src/auction-fee-schemas';
it.each([
  [true, true, true, 1193500],
  [false, true, true, 1032250],
  [true, false, true, 1161250],
  [true, true, false, 1180000],
  [false, false, true, 1000000],
  [false, false, false, 1000000],
  [false, true, false, 1030000],
  [true, false, false, 1150000],
])(
  'applies independent service/lot/VAT switches %s %s %s',
  (serviceChargeEnabled, lotFeeEnabled, vatEnabled, totalKobo) => {
    const rules = effectiveAuctionFeeRules({
      ...LEGACY_AUCTION_FEE_POLICY,
      serviceChargeEnabled,
      lotFeeEnabled,
      vatEnabled,
    });
    expect(calculateInvoiceLine(1000000, rules).totalKobo).toBe(totalKobo);
  },
);
it('keeps the supplied configuration immutable and calculates exact configured rates', () => {
  const policy = {
    ...LEGACY_AUCTION_FEE_POLICY,
    premiumBps: 1250,
    lotFeeKobo: 12345,
    vatBps: 500,
  };
  const before = structuredClone(policy);
  expect(
    calculateInvoiceLine(1000000, effectiveAuctionFeeRules(policy)),
  ).toEqual({
    hammerKobo: 1000000,
    premiumKobo: 125000,
    lotFeeKobo: 12345,
    vatKobo: 6867,
    totalKobo: 1144212,
  });
  expect(policy).toEqual(before);
});
it('validates all admin rates, amounts, expected revision, reason and exact request keys strictly', () => {
  const input = {
    ...LEGACY_AUCTION_FEE_POLICY,
    expectedRevision: 0,
    idempotencyKey: '22222222-2222-4222-8222-222222222222',
    reason: 'Configure auction charges',
  };
  const value = {
    serviceChargeEnabled: input.serviceChargeEnabled,
    premiumBps: input.premiumBps,
    lotFeeEnabled: input.lotFeeEnabled,
    lotFeeKobo: input.lotFeeKobo,
    vatEnabled: input.vatEnabled,
    vatBps: input.vatBps,
    expectedRevision: input.expectedRevision,
    idempotencyKey: input.idempotencyKey,
    reason: input.reason,
  };
  expect(auctionFeeUpdateSchema.safeParse(value).success).toBe(true);
  for (const invalid of [
    { ...value, premiumBps: 10001 },
    { ...value, vatBps: 7.5 },
    { ...value, lotFeeKobo: -1 },
    { ...value, reason: '' },
    { ...value, extra: true },
  ])
    expect(auctionFeeUpdateSchema.safeParse(invalid).success).toBe(false);
});
