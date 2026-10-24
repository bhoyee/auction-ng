import { addKobo, assertKobo, fromLedgerKobo, toLedgerKobo } from './money';

export type FeeRules = Readonly<{
  premiumBps: number;
  lotFeeKobo: number;
  vatBps: number;
}>;
// VAT is provisional and must be confirmed by the business owner before launch.
export const DEFAULT_FEE_RULES: FeeRules = Object.freeze({
  premiumBps: 1500,
  lotFeeKobo: 30000,
  vatBps: 750,
});

function rate(amount: number, bps: number): number {
  assertKobo(bps);
  if (bps > 10000)
    throw new RangeError('Basis points must be between zero and 10000.');
  // Integer intermediates avoid both binary floating point and unsafe products.
  return fromLedgerKobo((toLedgerKobo(amount) * BigInt(bps) + 5000n) / 10000n);
}

export function calculateInvoiceLine(
  hammerKobo: number,
  rules = DEFAULT_FEE_RULES,
) {
  assertKobo(hammerKobo);
  assertKobo(rules.lotFeeKobo);
  const premiumKobo = rate(hammerKobo, rules.premiumBps);
  const vatKobo = rate(addKobo(premiumKobo, rules.lotFeeKobo), rules.vatBps);
  const totalKobo = addKobo(hammerKobo, premiumKobo, rules.lotFeeKobo, vatKobo);
  return {
    hammerKobo,
    premiumKobo,
    lotFeeKobo: rules.lotFeeKobo,
    vatKobo,
    totalKobo,
  };
}
export function estimatedTotal(
  maxKobo: number,
  rules = DEFAULT_FEE_RULES,
): number {
  return calculateInvoiceLine(maxKobo, rules).totalKobo;
}
